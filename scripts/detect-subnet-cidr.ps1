$ErrorActionPreference = 'Stop'

$entry = (
  Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object {
    $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and
    $_.InterfaceAlias -notmatch 'Loopback'
  } |
  Select-Object -First 1
)

if ($entry) {
  $oct = $entry.IPAddress.Split('.')
  "$($oct[0]).$($oct[1]).$($oct[2]).0/$($entry.PrefixLength)"
  exit 0
}

$ip = (
  ipconfig |
  Select-String 'IPv4 Address|Adres IPv4' |
  ForEach-Object { $_.ToString().Split(':')[-1].Trim() } |
  Where-Object { $_ -and $_ -notmatch '^(127\.|169\.254\.)' } |
  Select-Object -First 1
)

if (-not $ip) {
  throw 'No subnet CIDR detected'
}

$oct = $ip.Split('.')
"$($oct[0]).$($oct[1]).$($oct[2]).0/24"
