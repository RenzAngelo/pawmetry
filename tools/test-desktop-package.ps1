param([Parameter(Mandatory)][string]$Zip)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dist = (Resolve-Path -LiteralPath (Join-Path $root 'dist')).Path
$archive = (Resolve-Path -LiteralPath $Zip).Path
if (!$archive.StartsWith($dist + '\', [StringComparison]::OrdinalIgnoreCase) -or
    (Split-Path -Leaf $archive) -notmatch '^Pawmetry-[0-9.]+-win32-x64-(preview|cat-review)\.zip$') {
    throw 'Select a trusted local Pawmetry build under dist.'
}
$cache = Join-Path $root '.cache'
$null = New-Item -ItemType Directory -Path $cache -Force
$parent = (Resolve-Path -LiteralPath $cache).Path
$unpack = Join-Path $parent ('pawmetry-zip-smoke-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $unpack
$prior = $env:ELECTRON_RUN_AS_NODE
$priorOptions = $env:NODE_OPTIONS
try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($archive, $unpack)
    $env:ELECTRON_RUN_AS_NODE = '1'
    $env:NODE_OPTIONS = '--pawmetry-invalid-node-flag'
    $app = Join-Path $unpack 'Pawmetry\Pawmetry.exe'
    $stdout = Join-Path $unpack 'smoke.out'
    $stderr = Join-Path $unpack 'smoke.err'
    $process = Start-Process -FilePath $app -ArgumentList '--smoke-test' -WindowStyle Hidden -PassThru -Wait -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    if ($process.ExitCode -ne 0) { Get-Content -LiteralPath $stderr; throw 'Packaged desktop smoke failed.' }
    if (!(Select-String -LiteralPath $stdout -Pattern 'Desktop simulation renderer smoke passed.' -SimpleMatch)) {
        throw 'Packaged desktop did not report success.'
    }
    if (!(Select-String -LiteralPath $stdout -Pattern 'Packaged build identity verified in About.' -SimpleMatch)) {
        throw 'Packaged desktop did not verify its build identity.'
    }
    if ($archive.EndsWith('-cat-review.zip') -and !(Select-String -LiteralPath $stdout -Pattern 'Cat atlas rendered and animated.' -SimpleMatch)) {
        throw 'Packaged Cat review did not display and animate its atlas.'
    }
    'Packaged desktop simulation smoke passed.'
} finally {
    $env:ELECTRON_RUN_AS_NODE = $prior
    $env:NODE_OPTIONS = $priorOptions
    $actual = (Resolve-Path -LiteralPath $unpack).Path
    if ((Split-Path -Parent $actual) -eq $parent -and (Split-Path -Leaf $actual) -match '^pawmetry-zip-smoke-[a-f0-9]{32}$') {
        Remove-Item -LiteralPath $actual -Recurse -Force
    }
}
