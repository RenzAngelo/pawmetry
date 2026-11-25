$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$cache = Join-Path $root '.cache\go-sdk'
$null = New-Item -ItemType Directory -Path $cache -Force
$release = 'go1.27.4.windows-amd64.zip'
$archive = Join-Path $cache $release
$checksum = '178ab98950ac69ab25069307dc6ade79f3816e414cce95b4da166a115cde1e7e'
if (!(Test-Path -LiteralPath $archive)) {
    curl.exe --fail --location --silent --show-error --max-time 180 "https://go.dev/dl/$release" --output $archive
    if ($LASTEXITCODE -ne 0) { throw 'Go download failed. Remove an incomplete archive before retrying.' }
}
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $checksum) {
    throw 'Go archive did not match the pinned official SHA-256. Remove the archive before retrying.'
}
Expand-Archive -LiteralPath $archive -DestinationPath $cache -Force
& (Join-Path $cache 'go\bin\go.exe') version
if ($LASTEXITCODE -ne 0) { throw 'The verified Go toolchain could not start.' }
