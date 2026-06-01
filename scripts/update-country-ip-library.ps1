param(
  [string[]]$CountryCodes = @(
    'pl','cn','ru','us','de','fr','gb','jp','kr','br','in','au','nl','ua','cz','se','no','fi','tr','ir','sa','za','ar','mx','ca','it','es'
  ),
  [int]$TopRanges = 120
)

$ErrorActionPreference = 'Stop'

function Convert-IPv4ToUInt32 {
  param([Parameter(Mandatory = $true)][string]$Ip)
  $bytes = [System.Net.IPAddress]::Parse($Ip).GetAddressBytes()
  [Array]::Reverse($bytes)
  return [BitConverter]::ToUInt32($bytes, 0)
}

function Convert-UInt32ToIPv4 {
  param([Parameter(Mandatory = $true)][uint32]$Value)
  $bytes = [BitConverter]::GetBytes($Value)
  [Array]::Reverse($bytes)
  return ([System.Net.IPAddress]::new($bytes)).ToString()
}

function Convert-CidrToRange {
  param([Parameter(Mandatory = $true)][string]$Cidr)

  $parts = $Cidr.Split('/')
  if ($parts.Count -ne 2) {
    return $null
  }

  $ip = $parts[0]
  $prefix = [int]$parts[1]
  if ($prefix -lt 0 -or $prefix -gt 32) {
    return $null
  }

  try {
    $parsedIp = [System.Net.IPAddress]::Parse($ip)
  }
  catch {
    return $null
  }
  if ($parsedIp.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
    return $null
  }

  $ipNum = Convert-IPv4ToUInt32 -Ip $ip
  [uint64]$all = 4294967295
  [uint64]$mask = 0
  if ($prefix -gt 0) {
    $mask = ($all -shl (32 - $prefix)) -band $all
  }

  [uint32]$network = [uint32](([uint64]$ipNum) -band $mask)
  [uint32]$broadcast = [uint32](([uint64]$network) -bor ($all -bxor $mask))

  $from = Convert-UInt32ToIPv4 -Value $network
  $to = Convert-UInt32ToIPv4 -Value $broadcast
  return "$from-$to"
}

$countryMeta = @{
  'pl' = @{ name = 'Poland';          flag = 'PL'; meta = 'PL - Europe' }
  'cn' = @{ name = 'China';           flag = 'CN'; meta = 'CN - Asia' }
  'ru' = @{ name = 'Russia';          flag = 'RU'; meta = 'RU - Europe/Asia' }
  'us' = @{ name = 'United States';   flag = 'US'; meta = 'US - Americas' }
  'de' = @{ name = 'Germany';         flag = 'DE'; meta = 'DE - Europe' }
  'fr' = @{ name = 'France';          flag = 'FR'; meta = 'FR - Europe' }
  'gb' = @{ name = 'United Kingdom';  flag = 'GB'; meta = 'GB - Europe' }
  'jp' = @{ name = 'Japan';           flag = 'JP'; meta = 'JP - Asia' }
  'kr' = @{ name = 'South Korea';     flag = 'KR'; meta = 'KR - Asia' }
  'br' = @{ name = 'Brazil';          flag = 'BR'; meta = 'BR - Americas' }
  'in' = @{ name = 'India';           flag = 'IN'; meta = 'IN - Asia' }
  'au' = @{ name = 'Australia';       flag = 'AU'; meta = 'AU - Oceania' }
  'nl' = @{ name = 'Netherlands';     flag = 'NL'; meta = 'NL - Europe' }
  'ua' = @{ name = 'Ukraine';         flag = 'UA'; meta = 'UA - Europe' }
  'cz' = @{ name = 'Czech Republic';  flag = 'CZ'; meta = 'CZ - Europe' }
  'se' = @{ name = 'Sweden';          flag = 'SE'; meta = 'SE - Europe' }
  'no' = @{ name = 'Norway';          flag = 'NO'; meta = 'NO - Europe' }
  'fi' = @{ name = 'Finland';         flag = 'FI'; meta = 'FI - Europe' }
  'tr' = @{ name = 'Turkey';          flag = 'TR'; meta = 'TR - Europe/Asia' }
  'ir' = @{ name = 'Iran';            flag = 'IR'; meta = 'IR - Asia' }
  'sa' = @{ name = 'Saudi Arabia';    flag = 'SA'; meta = 'SA - Asia' }
  'za' = @{ name = 'South Africa';    flag = 'ZA'; meta = 'ZA - Africa' }
  'ar' = @{ name = 'Argentina';       flag = 'AR'; meta = 'AR - Americas' }
  'mx' = @{ name = 'Mexico';          flag = 'MX'; meta = 'MX - Americas' }
  'ca' = @{ name = 'Canada';          flag = 'CA'; meta = 'CA - Americas' }
  'it' = @{ name = 'Italy';           flag = 'IT'; meta = 'IT - Europe' }
  'es' = @{ name = 'Spain';           flag = 'ES'; meta = 'ES - Europe' }
}

$result = New-Object System.Collections.Generic.List[object]

foreach ($rawCode in $CountryCodes) {
  $code = ($rawCode | ForEach-Object { $_.Trim().ToLowerInvariant() })
  if ([string]::IsNullOrWhiteSpace($code)) {
    continue
  }

  if (-not $countryMeta.ContainsKey($code)) {
    Write-Error "Unsupported country code: $code"
    continue
  }

  $url = "https://www.ipdeny.com/ipblocks/data/countries/$code.zone"
  try {
    $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 -Uri $url
    $lines = @($resp.Content -split "`r?`n")
  }
  catch {
    Write-Error "Failed to download $code from $url. $($_.Exception.Message)"
    continue
  }

  $ranges = New-Object System.Collections.Generic.List[string]
  foreach ($line in $lines) {
    $cidr = ($line | ForEach-Object { $_.Trim() })
    if ($cidr -notmatch '^(?:\d{1,3}\.){3}\d{1,3}/\d{1,2}$') {
      continue
    }

    try {
      $range = Convert-CidrToRange -Cidr $cidr
    }
    catch {
      continue
    }
    if (-not [string]::IsNullOrWhiteSpace($range)) {
      $ranges.Add($range)
    }

    if ($ranges.Count -ge $TopRanges) {
      break
    }
  }

  $meta = $countryMeta[$code]
  $entry = [PSCustomObject]@{
    flag = $meta.flag
    name = $meta.name
    meta = $meta.meta
    ranges = @($ranges)
  }
  $result.Add($entry)
}

$result | ConvertTo-Json -Depth 6 -Compress
