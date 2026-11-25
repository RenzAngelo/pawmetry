$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$scratch = Join-Path $workspaceRoot ('.cache\vscode-smoke-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $scratch
$result = Join-Path $scratch 'result.txt'
$priorResult = $env:PAWMETRY_VSCODE_TEST_RESULT
$priorIpc = $env:VSCODE_IPC_HOOK_CLI
try {
    $env:PAWMETRY_VSCODE_TEST_RESULT = $result
    $env:VSCODE_IPC_HOOK_CLI = $null
    code.cmd --new-window --disable-extensions --disable-telemetry --user-data-dir (Join-Path $scratch 'user') --extensions-dir (Join-Path $scratch 'extensions') --extensionDevelopmentPath (Join-Path $workspaceRoot 'apps\vscode') --extensionTestsPath (Join-Path $workspaceRoot 'apps\vscode\test\host.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'VS Code failed to launch the disposable extension host.' }
    $deadline = [DateTime]::UtcNow.AddSeconds(25)
    while (!(Test-Path -LiteralPath $result) -and [DateTime]::UtcNow -lt $deadline) {
        Start-Sleep -Milliseconds 250
    }
    if (!(Test-Path -LiteralPath $result)) { throw 'The VS Code extension host did not report a test result.' }
    if ((Get-Content -LiteralPath $result -Raw) -ne 'passed') { throw 'The VS Code extension host test failed.' }
    'VS Code prototype host smoke passed.'
}
finally {
    $env:PAWMETRY_VSCODE_TEST_RESULT = $priorResult
    $env:VSCODE_IPC_HOOK_CLI = $priorIpc
}
