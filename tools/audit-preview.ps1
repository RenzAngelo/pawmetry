param([Parameter(Mandatory)][string]$Directory, [switch]$SingleInstall, [switch]$CatReview, [switch]$PublicRelease)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$pattern = if ($SingleInstall) { '^Pawmetry-[0-9.]+-win32-x64-single-install(?:-cat-review)?\.vsix$' } else { '^Pawmetry-[0-9.]+-(win32-x64-preview\.zip|preview\.vsix)$' }
$artifacts = @(Get-ChildItem -LiteralPath $Directory -File | Where-Object { $_.Name -match $pattern })
if ($artifacts.Count -ne $(if ($SingleInstall) { 1 } else { 2 })) { throw 'Unexpected number of preview packages.' }
$forbidden = '(codex-activity-probe|PawmetryActivity|native-helper|\.codex[/\\]|default_app\.asar|/tests?/|/\.cache/|auth\.json)'
$markers = '(prepareReceiver|start-activity|stop-activity|prepare-disposable|check-hooks|reviewCommand|privateActivityRoot|setLoginItemSettings)'
foreach ($artifact in $artifacts) {
    $archive = [IO.Compression.ZipFile]::OpenRead($artifact.FullName)
    try {
        foreach ($entry in $archive.Entries) {
            if ($entry.FullName -match $forbidden) { throw "Unexpected preview archive entry $($entry.FullName)" }
            if ($entry.FullName -notmatch '\.(cjs|mjs|js|ts|ps1|html)$') { continue }
            $reader = [IO.StreamReader]::new($entry.Open())
            try {
                if ($reader.ReadToEnd() -match $markers) { throw "Unexpected preview capability in $($entry.FullName)" }
            } finally { $reader.Dispose() }
        }
        $required = if ($artifact.Extension -eq '.zip') { 'Pawmetry/Pawmetry.exe', 'Pawmetry/resources/app/apps/desktop/main.mjs' }
                    else { 'extension/extension.cjs', 'extension/package.json', 'extension/icon.png' }
        if ($SingleInstall) { $required += 'extension/companion-build.json', 'extension/companion/Pawmetry.exe', 'extension/companion/resources/app/apps/desktop/main.mjs' }
        $names = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
        if (!$CatReview -and !$PublicRelease -and ($names -match '(^|/)assets/mascots/cat/')) { throw 'Package contains unapproved Cat artwork.' }
        if ($PublicRelease) {
            # VSCE normalizes the root LICENSE to LICENSE.txt in the archive.
            foreach ($path in @('extension/LICENSE.txt', 'extension/assets/mascots/cat/DISTRIBUTION.md',
                'extension/companion/resources/app/assets/mascots/cat/sprites.png', 'extension/companion/resources/app/assets/mascots/cat/atlas.json')) {
                if ($names -cnotcontains $path) { throw "Missing public package file $path" }
            }
        }
        foreach ($path in $required) {
            if ($names -cnotcontains $path) { throw "Missing preview archive entry $path" }
        }
        if ($SingleInstall) {
            $packageReader = [IO.StreamReader]::new($archive.GetEntry('extension.vsixmanifest').Open())
            try {
                $package = [xml]$packageReader.ReadToEnd()
                $preview = $package.PackageManifest.Metadata.Properties.Property | Where-Object { $_.Id -eq 'Microsoft.VisualStudio.Code.PreRelease' }
                if ($package.PackageManifest.Metadata.Identity.TargetPlatform -ne 'win32-x64' -or $preview.Value -ne 'true') {
                    throw 'Single-install VSIX must target Windows x64 and opt into the pre-release channel.'
                }
            } finally { $packageReader.Dispose() }
            $manifestReader = [IO.StreamReader]::new($archive.GetEntry('extension/package.json').Open())
            try {
                $manifest = $manifestReader.ReadToEnd() | ConvertFrom-Json
                if ($manifest.contributes.commands.command -match '^pawmetry\.(nextSimulation|stopSimulation)$') { throw 'Single-install package exposes simulation commands.' }
                if ($PublicRelease -and ($manifest.publisher -cne 'renzangelo' -or $manifest.name -cne 'pawmetry' -or
                    $manifest.license -cne 'MIT' -or $manifest.pricing -cne 'Free' -or
                    $package.PackageManifest.Metadata.Identity.Publisher -cne $manifest.publisher)) {
                    throw 'Unexpected public preview publisher, extension name, license or pricing.'
                }
            } finally { $manifestReader.Dispose() }
        }
    } finally { $archive.Dispose() }
}
'Preview archives contain the companion and editor entry points with no experimental hooks or helper.'
