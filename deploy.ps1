# Deploy usageresetpetition.jonbailey.xyz
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$TokenFile = Join-Path $env:USERPROFILE ".grok\secrets\cloudflare_full_token.txt"

if (-not $env:CLOUDFLARE_API_TOKEN) {
  $userTok = [Environment]::GetEnvironmentVariable("CLOUDFLARE_API_TOKEN", "User")
  if ($userTok) { $env:CLOUDFLARE_API_TOKEN = $userTok }
  elseif (Test-Path -LiteralPath $TokenFile) {
    $env:CLOUDFLARE_API_TOKEN = (Get-Content -LiteralPath $TokenFile -Raw).Trim()
  }
}
if (-not $env:CLOUDFLARE_API_TOKEN) { Write-Error "Missing Cloudflare token" }

Set-Location $Root
$tomlPath = Join-Path $Root "wrangler.toml"
$toml = [System.IO.File]::ReadAllText($tomlPath)
function Invoke-Wrangler {
  param([Parameter(Mandatory = $true)][string[]]$WranglerArgs)
  $log = Join-Path $env:TEMP ("usage-reset-wrangler-" + [guid]::NewGuid().ToString("n") + ".log")
  $argLine = ($WranglerArgs | ForEach-Object {
    if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ }
  }) -join " "
  cmd /c "npx --yes wrangler@4 $argLine > `"$log`" 2>&1"
  $code = $LASTEXITCODE
  $text = ""
  if (Test-Path -LiteralPath $log) { $text = [System.IO.File]::ReadAllText($log) }
  Remove-Item -LiteralPath $log -ErrorAction SilentlyContinue
  return @{ Code = $code; Text = $text }
}

if ($toml.Contains("REPLACE_KV_ID")) {
  Write-Host "[DEPLOY] creating KV namespace usage-reset-petition"
  $created = Invoke-Wrangler @("kv", "namespace", "create", "usage-reset-petition")
  if ($created.Code -ne 0) {
    Write-Host $created.Text
    exit $created.Code
  }
  $match = [regex]::Match($created.Text, 'id = "([a-f0-9]+)"')
  if (-not $match.Success) {
    Write-Host $created.Text
    Write-Error "KV create did not return an id"
  }
  $toml = $toml.Replace("REPLACE_KV_ID", $match.Groups[1].Value)
  [System.IO.File]::WriteAllText($tomlPath, $toml)
  Write-Host "[DEPLOY] KV id written"
}

Write-Host "[DEPLOY] usage-reset-petition"
$ship = Invoke-Wrangler @("deploy")
Write-Host $ship.Text
if ($ship.Code -ne 0) { exit $ship.Code }
Write-Host "[DEPLOY] done https://usageresetpetition.jonbailey.xyz/"
