using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Diagnostics;
using System.Net;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;

namespace NetRecon.Native;

public partial class MainWindow : Window
{
    private readonly DispatcherTimer _scanTimer;
    private readonly ObservableCollection<ScanRow> _rows = [];
    private readonly HttpClient _http = new();
    private DateTime _scanStart;
    private bool _scanning;
    private CancellationTokenSource? _scanCts;
    private int _checkedHosts;
    private int _foundHosts;
    private int _openPortsCount;

    public MainWindow()
    {
        InitializeComponent();

        ResultsGrid.ItemsSource = _rows;

        _scanTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(200) };
        _scanTimer.Tick += (_, _) =>
        {
            var elapsed = DateTime.Now - _scanStart;
            ScanTimeText.Text = $"{elapsed.TotalSeconds:0.0}s";
        };

        ApplyButtonVisibilityOptions();
    }

    private async void BtnStart_Click(object sender, RoutedEventArgs e)
    {
        if (_scanning) return;

        if (!TryParseIpRange(IpRangeText.Text, out var startIp, out var endIp))
        {
            MessageBox.Show("Invalid IP range format. Use: 192.168.1.1 - 192.168.1.254", "Scan", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        var ports = ParsePorts(PortsText.Text);
        if (ports.Count == 0)
        {
            MessageBox.Show("Enter at least one valid port.", "Scan", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        var threads = ParseInt(ThreadsText.Text, 20, 1, 256);
        var delayMs = ParseInt(DelayText.Text, 0, 0, 5000);

        _rows.Clear();
        _checkedHosts = 0;
        _foundHosts = 0;
        _openPortsCount = 0;
        UpdateCounters();

        _scanCts?.Cancel();
        _scanCts = new CancellationTokenSource();

        _scanning = true;
        BtnStart.IsEnabled = false;
        BtnStop.IsEnabled = true;
        _scanStart = DateTime.Now;
        ScanTimeText.Text = "0.0s";
        _scanTimer.Start();
        StatusText.Text = "Scanning...";

        try
        {
            await ScanRangeAsync(startIp, endIp, ports, threads, delayMs, _scanCts.Token);
            StatusText.Text = _scanCts.IsCancellationRequested ? "Stopped" : "Done";
        }
        catch (OperationCanceledException)
        {
            StatusText.Text = "Stopped";
        }
        finally
        {
            _scanning = false;
            BtnStart.IsEnabled = true;
            BtnStop.IsEnabled = false;
            _scanTimer.Stop();
        }
    }

    private void BtnStop_Click(object sender, RoutedEventArgs e)
    {
        _scanCts?.Cancel();
        StatusText.Text = "Stopping...";
    }

    private void BtnClear_Click(object sender, RoutedEventArgs e)
    {
        _scanCts?.Cancel();
        _rows.Clear();
        _checkedHosts = 0;
        _foundHosts = 0;
        _openPortsCount = 0;
        UpdateCounters();
        StatusText.Text = "Results cleared";
    }

    private async void BtnExternalIp_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            using var res = await _http.GetAsync("https://api.ipify.org?format=json");
            res.EnsureSuccessStatusCode();
            using var stream = await res.Content.ReadAsStreamAsync();
            var payload = await JsonSerializer.DeserializeAsync<IpifyResponse>(stream);
            StatusText.Text = payload?.Ip is { Length: > 0 } ? $"External IP: {payload.Ip}" : "External IP unavailable";
        }
        catch (Exception ex)
        {
            StatusText.Text = $"External IP error: {ex.Message}";
        }
    }

    private void BtnLocalIp_Click(object sender, RoutedEventArgs e)
    {
        var ip = GetLocalIpv4();
        StatusText.Text = ip is null ? "Local IP unavailable" : $"Local IP: {ip}";
    }

    private void BtnLocalSubnets_Click(object sender, RoutedEventArgs e)
    {
        var subnets = GetLocalSubnets();
        StatusText.Text = subnets.Count == 0 ? "No local subnets" : $"Local subnets: {string.Join(", ", subnets)}";
    }

    private void ExitMenu_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }

    private void ButtonVisibilityChanged(object sender, RoutedEventArgs e)
    {
        ApplyButtonVisibilityOptions();
    }

    private void ApplyButtonVisibilityOptions()
    {
        BtnStart.Visibility = OptShowStart.IsChecked ? Visibility.Visible : Visibility.Collapsed;
        BtnStop.Visibility = OptShowStop.IsChecked ? Visibility.Visible : Visibility.Collapsed;
        BtnClear.Visibility = OptShowClear.IsChecked ? Visibility.Visible : Visibility.Collapsed;
        BtnExternalIp.Visibility = OptShowExternalIp.IsChecked ? Visibility.Visible : Visibility.Collapsed;
        BtnLocalIp.Visibility = OptShowLocalIp.IsChecked ? Visibility.Visible : Visibility.Collapsed;
        BtnLocalSubnets.Visibility = OptShowLocalSubnets.IsChecked ? Visibility.Visible : Visibility.Collapsed;

        if (!_scanning)
        {
            BtnStart.IsEnabled = true;
            BtnStop.IsEnabled = false;
        }
    }

    private async Task ScanRangeAsync(uint startIp, uint endIp, List<int> ports, int threads, int delayMs, CancellationToken ct)
    {
        using var sem = new SemaphoreSlim(threads, threads);
        var tasks = new List<Task>();

        for (var ipNum = startIp; ipNum <= endIp; ipNum++)
        {
            ct.ThrowIfCancellationRequested();
            await sem.WaitAsync(ct);

            var ip = UInt32ToIp(ipNum);
            tasks.Add(Task.Run(async () =>
            {
                try
                {
                    await ScanHostAsync(ip, ports, ct);
                }
                finally
                {
                    sem.Release();
                }
            }, ct));

            if (delayMs > 0) await Task.Delay(delayMs, ct);
        }

        await Task.WhenAll(tasks);
    }

    private async Task ScanHostAsync(string ip, List<int> ports, CancellationToken ct)
    {
        var pingMs = await PingHostAsync(ip, 800);
        var openPorts = new List<int>();

        foreach (var port in ports)
        {
            ct.ThrowIfCancellationRequested();
            if (await IsPortOpenAsync(ip, port, 900, ct)) openPorts.Add(port);
        }

        Interlocked.Increment(ref _checkedHosts);

        if (openPorts.Count > 0)
        {
            Interlocked.Increment(ref _foundHosts);
            Interlocked.Add(ref _openPortsCount, openPorts.Count);
            var hostname = await LookupHostnameAsync(ip);

            await Dispatcher.InvokeAsync(() =>
            {
                _rows.Add(new ScanRow
                {
                    Ip = ip,
                    Ping = pingMs.HasValue ? $"{pingMs.Value} ms" : "-",
                    Ports = string.Join(", ", openPorts),
                    Hostname = hostname ?? "-",
                    Status = "Open"
                });
            });
        }

        await Dispatcher.InvokeAsync(UpdateCounters);
    }

    private static async Task<bool> IsPortOpenAsync(string ip, int port, int timeoutMs, CancellationToken ct)
    {
        using var client = new TcpClient();
        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeoutCts.CancelAfter(timeoutMs);
        try
        {
            await client.ConnectAsync(ip, port, timeoutCts.Token);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static async Task<long?> PingHostAsync(string ip, int timeoutMs)
    {
        try
        {
            using var ping = new Ping();
            var reply = await ping.SendPingAsync(ip, timeoutMs);
            return reply.Status == IPStatus.Success ? reply.RoundtripTime : null;
        }
        catch
        {
            return null;
        }
    }

    private static async Task<string?> LookupHostnameAsync(string ip)
    {
        try
        {
            var entry = await Dns.GetHostEntryAsync(ip);
            return string.IsNullOrWhiteSpace(entry.HostName) ? null : entry.HostName;
        }
        catch
        {
            return null;
        }
    }

    private void UpdateCounters()
    {
        CheckedText.Text = _checkedHosts.ToString();
        FoundText.Text = _foundHosts.ToString();
        OpenPortsText.Text = _openPortsCount.ToString();
    }

    private static int ParseInt(string? raw, int fallback, int min, int max)
    {
        if (!int.TryParse(raw, out var value)) return fallback;
        if (value < min) return min;
        if (value > max) return max;
        return value;
    }

    private static List<int> ParsePorts(string raw)
    {
        var outPorts = new List<int>();
        foreach (var part in raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (int.TryParse(part, out var p) && p is > 0 and <= 65535) outPorts.Add(p);
        }
        return outPorts.Distinct().OrderBy(p => p).ToList();
    }

    private static bool TryParseIpRange(string raw, out uint start, out uint end)
    {
        start = 0;
        end = 0;
        var parts = raw.Split('-', StringSplitOptions.TrimEntries);
        if (parts.Length != 2) return false;
        if (!TryParseIp(parts[0], out start)) return false;
        if (!TryParseIp(parts[1], out end)) return false;
        if (start > end) return false;
        return true;
    }

    private static bool TryParseIp(string ip, out uint value)
    {
        value = 0;
        if (!IPAddress.TryParse(ip, out var addr)) return false;
        var bytes = addr.GetAddressBytes();
        if (bytes.Length != 4) return false;
        value = ((uint)bytes[0] << 24) | ((uint)bytes[1] << 16) | ((uint)bytes[2] << 8) | bytes[3];
        return true;
    }

    private static string UInt32ToIp(uint ip) => string.Join('.',
        (ip >> 24) & 255,
        (ip >> 16) & 255,
        (ip >> 8) & 255,
        ip & 255);

    private static string? GetLocalIpv4()
    {
        try
        {
            return Dns.GetHostEntry(Dns.GetHostName())
                .AddressList
                .FirstOrDefault(a => a.AddressFamily == AddressFamily.InterNetwork)
                ?.ToString();
        }
        catch
        {
            return null;
        }
    }

    private static List<string> GetLocalSubnets()
    {
        var results = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            var nics = NetworkInterface.GetAllNetworkInterfaces()
                .Where(n => n.OperationalStatus == OperationalStatus.Up && n.NetworkInterfaceType != NetworkInterfaceType.Loopback);
            foreach (var nic in nics)
            {
                foreach (var uni in nic.GetIPProperties().UnicastAddresses)
                {
                    var ip = uni.Address;
                    if (ip.AddressFamily != AddressFamily.InterNetwork) continue;
                    var b = ip.GetAddressBytes();
                    results.Add($"{b[0]}.{b[1]}.{b[2]}.0/24");
                }
            }
        }
        catch
        {
            // ignore and return what we have
        }
        return results.OrderBy(x => x).ToList();
    }

    private ScanRow? SelectedRow => ResultsGrid.SelectedItem as ScanRow;

    private void CopyIp_Click(object sender, RoutedEventArgs e)
    {
        if (SelectedRow is null) return;
        Clipboard.SetText(SelectedRow.Ip);
        StatusText.Text = $"Copied IP: {SelectedRow.Ip}";
    }

    private void CopyPorts_Click(object sender, RoutedEventArgs e)
    {
        if (SelectedRow is null) return;
        Clipboard.SetText(SelectedRow.Ports);
        StatusText.Text = $"Copied ports: {SelectedRow.Ports}";
    }

    private async void ShowHostname_Click(object sender, RoutedEventArgs e)
    {
        if (SelectedRow is null) return;
        var hostname = await LookupHostnameAsync(SelectedRow.Ip) ?? "No reverse DNS";
        MessageBox.Show(hostname, $"Hostname - {SelectedRow.Ip}", MessageBoxButton.OK, MessageBoxImage.Information);
    }

    private void OpenInBrowser_Click(object sender, RoutedEventArgs e)
    {
        if (SelectedRow is null) return;
        var firstPort = SelectedRow.Ports.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
        if (!int.TryParse(firstPort, out var p)) p = 80;
        var proto = p is 443 or 8443 ? "https" : "http";
        var url = $"{proto}://{SelectedRow.Ip}:{p}/";
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
    }
}

internal sealed class ScanRow : INotifyPropertyChanged
{
    private string _ip = string.Empty;
    private string _ping = string.Empty;
    private string _ports = string.Empty;
    private string _hostname = string.Empty;
    private string _status = string.Empty;

    public string Ip { get => _ip; set => Set(ref _ip, value); }
    public string Ping { get => _ping; set => Set(ref _ping, value); }
    public string Ports { get => _ports; set => Set(ref _ports, value); }
    public string Hostname { get => _hostname; set => Set(ref _hostname, value); }
    public string Status { get => _status; set => Set(ref _status, value); }

    public event PropertyChangedEventHandler? PropertyChanged;

    private void Set<T>(ref T field, T value, [CallerMemberName] string? property = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value)) return;
        field = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(property));
    }
}

internal sealed class IpifyResponse
{
    public string? Ip { get; set; }
}