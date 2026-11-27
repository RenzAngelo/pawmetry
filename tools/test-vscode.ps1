param([string]$Vsix)

$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$scratch = Join-Path $workspaceRoot ('.cache\vscode-smoke-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $scratch
$result = Join-Path $scratch 'result.txt'
$priorResult = $env:PAWMETRY_VSCODE_TEST_RESULT
$priorExtension = $env:PAWMETRY_VSCODE_TEST_EXTENSION
$priorIpc = $env:VSCODE_IPC_HOOK_CLI
try {
    $env:PAWMETRY_VSCODE_TEST_RESULT = $result
    $env:VSCODE_IPC_HOOK_CLI = $null
    $user = Join-Path $scratch 'user'
    $extensions = Join-Path $scratch 'extensions'
    $extension = Join-Path $workspaceRoot 'apps\vscode'
    $testEntry = Join-Path $extension 'test\host.cjs'
    if ($Vsix) {
        $package = (Resolve-Path -LiteralPath $Vsix).Path
        code.cmd --disable-telemetry --user-data-dir $user --extensions-dir $extensions --install-extension $package
        if ($LASTEXITCODE -ne 0) { throw 'Local VSIX installation failed.' }
        $installed = @(Get-ChildItem -LiteralPath $extensions -Directory -Filter '*.pawmetry-*')
        if ($installed.Count -ne 1) { throw 'Unexpected Pawmetry extension installation.' }
        $extension = $installed[0].FullName
        $copy = Join-Path $extension '__local_test_host.cjs'
        Copy-Item -LiteralPath $testEntry -Destination $copy
        $testEntry = $copy
    }
    $manifest = Get-Content -LiteralPath (Join-Path $extension 'package.json') -Raw | ConvertFrom-Json
    $env:PAWMETRY_VSCODE_TEST_EXTENSION = "$($manifest.publisher).$($manifest.name)"
    code.cmd --new-window --disable-extensions --disable-telemetry --user-data-dir $user --extensions-dir $extensions --extensionDevelopmentPath $extension --extensionTestsPath $testEntry
    if ($LASTEXITCODE -ne 0) { throw 'VS Code failed to launch the disposable extension host.' }
    $deadline = [DateTime]::UtcNow.AddSeconds(25)
    $outcome = $null
    while ([DateTime]::UtcNow -lt $deadline) {
        # The extension host creates the file before it finishes writing its verdict.
        $outcome = Get-Content -LiteralPath $result -Raw -ErrorAction SilentlyContinue
        if ($outcome -in @('passed', 'failed')) { break }
        Start-Sleep -Milliseconds 250
    }
    if ($outcome -eq 'failed') { throw 'The VS Code extension host test failed.' }
    if ($outcome -ne 'passed') { throw 'The VS Code extension host did not report a test result.' }
    'VS Code preview host smoke passed.'
}
finally {
    $env:PAWMETRY_VSCODE_TEST_RESULT = $priorResult
    $env:PAWMETRY_VSCODE_TEST_EXTENSION = $priorExtension
    $env:VSCODE_IPC_HOOK_CLI = $priorIpc
}
