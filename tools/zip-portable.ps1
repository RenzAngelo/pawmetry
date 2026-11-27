param([Parameter(Mandatory)][string]$Source, [Parameter(Mandatory)][string]$OutputFile)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($Source, $OutputFile, [IO.Compression.CompressionLevel]::Optimal, $true)
