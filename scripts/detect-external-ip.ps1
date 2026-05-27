$ErrorActionPreference = 'Stop'

$ip = (Invoke-RestMethod -UseBasicParsing 'https://api.ipify.org').ToString().Trim()
if (-not $ip) {
  throw 'No external IP detected'
}

$ip
