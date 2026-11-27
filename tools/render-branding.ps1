$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$brand = Join-Path $root 'assets\branding\pawmetry'
$scratch = Join-Path $root ('.cache\logo-render-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $scratch -Force
$browser = @(
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe')
) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (!$browser) { throw 'Chrome or Edge is required to render the logo assets.' }
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$parts = @(foreach ($size in $sizes) { '<img width="' + $size + '" height="' + $size + '" src="' + ([uri](Join-Path $brand 'icon.svg')).AbsoluteUri + '">' })
$parts += '<img width="32" height="32" src="' + ([uri](Join-Path $brand 'icon-light.svg')).AbsoluteUri + '">'
$html = Join-Path $scratch 'render.html'
Set-Content -LiteralPath $html -Encoding utf8 -Value ('<!doctype html><meta charset="utf-8"><style>body{margin:0;display:flex;align-items:flex-start}</style>' + ($parts -join ''))
$sheet = Join-Path $scratch 'sheet.png'
$profile = Join-Path $scratch 'profile'
$process = Start-Process -FilePath $browser -ArgumentList @('--headless', '--disable-background-networking', '--disable-extensions', '--no-first-run', '--window-size=650,360', '--force-device-scale-factor=1', '--default-background-color=00000000', ('--user-data-dir="' + $profile + '"'), ('--screenshot="' + $sheet + '"'), ([uri]$html).AbsoluteUri) -WindowStyle Hidden -PassThru -Wait
if ($process.ExitCode -ne 0 -or !(Test-Path -LiteralPath $sheet -PathType Leaf)) { throw 'Logo sheet render failed.' }
$bitmap = [Drawing.Bitmap]::new($sheet)
try {
    $x = 0
    $frames = [Collections.Generic.List[byte[]]]::new()
    foreach ($size in ($sizes + 32)) {
        $part = $bitmap.Clone([Drawing.Rectangle]::new($x, 0, $size, $size), [Drawing.Imaging.PixelFormat]::Format32bppArgb)
        try {
            if ($part.GetPixel(0, 0).A -ne 0 -or $part.GetPixel([int]($size / 2), [int]($size / 2)).A -ne 255) { throw 'Logo raster transparency check failed.' }
            $stream = [IO.MemoryStream]::new()
            try { $part.Save($stream, [Drawing.Imaging.ImageFormat]::Png); $frames.Add($stream.ToArray()) }
            finally { $stream.Dispose() }
        } finally { $part.Dispose() }
        $x += $size
    }
    [IO.File]::WriteAllBytes((Join-Path $brand 'app.png'), $frames[5])
    [IO.File]::WriteAllBytes((Join-Path $brand 'tray-dark.png'), $frames[2])
    [IO.File]::WriteAllBytes((Join-Path $brand 'tray-light.png'), $frames[7])
    $writer = [IO.BinaryWriter]::new([IO.File]::Create((Join-Path $brand 'app.ico')))
    try {
        $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
        $offset = 6 + 16 * $sizes.Count
        for ($i = 0; $i -lt $sizes.Count; $i++) {
            $size = [byte]($sizes[$i] % 256)
            $writer.Write($size); $writer.Write($size); $writer.Write([uint16]0)
            $writer.Write([uint16]1); $writer.Write([uint16]32)
            $writer.Write([uint32]$frames[$i].Length); $writer.Write([uint32]$offset)
            $offset += $frames[$i].Length
        }
        for ($i = 0; $i -lt $sizes.Count; $i++) { $writer.Write($frames[$i]) }
    } finally { $writer.Dispose() }
} finally { $bitmap.Dispose() }
'Rendered Pawmetry logo PNGs and seven Windows ICO sizes.'
