param(
    [Parameter(Mandatory)][string]$Runtime,
    [Parameter(Mandatory)][string]$Helper,
    [Parameter(Mandatory)][ValidateSet('node', 'electron')][string]$RuntimeKind,
    [Parameter(Mandatory)][int]$Port,
    [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{64}$')][string]$Capability,
    [Parameter(Mandatory)][ValidateSet('A', 'B')][string]$Workspace,
    [Parameter(Mandatory)][ValidateSet('SessionStart', 'SessionEnd', 'PreToolUse', 'PostToolUse', 'PreModelRequest', 'PostModelRequest', 'Interrupt', 'Stop')][string]$EventName,
    [Parameter(Mandatory)][string]$WorkspaceRoot,
    [ValidatePattern('^[a-f0-9]{32}$')][string]$Probe
)
$ErrorActionPreference = 'Stop'
if ($RuntimeKind -eq 'electron') { $env:ELECTRON_RUN_AS_NODE = '1' }
$argsForHelper = @($Helper, $Port, $Capability, $Workspace, $EventName, $WorkspaceRoot)
if ($Probe) { $argsForHelper += $Probe }
# Using a pipeline waits for the Windows GUI subsystem executable to finish.
& $Runtime @argsForHelper | Write-Output
exit $LASTEXITCODE
