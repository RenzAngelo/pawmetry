param(
    [Parameter(Mandatory)][ValidateSet('read', 'publish', 'clear')][string]$Action,
    [ValidatePattern('^([0-9a-f]{32})?$')][string]$TestNamespace = ''
)

$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$logon = & (Join-Path ([Environment]::SystemDirectory) 'whoami.exe') /logonid
$sidMatch = [regex]::Matches(($logon -join ' '), 'S-1-5-5-\d+-\d+')
if ($LASTEXITCODE -ne 0 -or $sidMatch.Count -ne 1) { exit 1 }
$sid = [Security.Principal.SecurityIdentifier]::new($sidMatch[0].Value)
$base = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
if (!$base -or ([IO.DriveInfo]::new([IO.Path]::GetPathRoot($base))).DriveType -ne 'Fixed') { exit 1 }
for ($parent = [IO.DirectoryInfo]::new($base); $null -ne $parent; $parent = $parent.Parent) {
    if (!$parent.Exists -or ($parent.Attributes -band [IO.FileAttributes]::ReparsePoint)) { exit 1 }
}
$name = 'Pawmetry-ipc-v1-' + $sid.Value
if ($TestNamespace) { $name += '-test-' + $TestNamespace }
$directory = Join-Path $base $name
$path = Join-Path $directory 'endpoint.json'

function Assert-Private([string]$Target, [bool]$IsDirectory) {
    $info = Get-Item -LiteralPath $Target -Force
    if ($info.PSIsContainer -ne $IsDirectory -or ($info.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'IPC path' }
    $acl = Get-Acl -LiteralPath $Target
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $identity.User.Value) { throw 'IPC owner' }
    $rules = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
    if ($rules.Count -ne 1 -or $rules[0].IdentityReference.Value -ne $sid.Value -or
        $rules[0].AccessControlType -ne 'Allow' -or $rules[0].FileSystemRights -ne 'FullControl') { throw 'IPC access' }
    $inherits = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
    if ($IsDirectory -and (!$acl.AreAccessRulesProtected -or $rules[0].InheritanceFlags -ne $inherits -or
        $rules[0].PropagationFlags -ne 'None')) { throw 'IPC inheritance' }
}

try {
    if ($Action -eq 'publish' -and ![IO.Directory]::Exists($directory)) {
        $security = [Security.AccessControl.DirectorySecurity]::new()
        $security.SetAccessRuleProtection($true, $false)
        $security.SetOwner($identity.User)
        $flags = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
        $security.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', $flags, 'None', 'Allow'))
        $null = [IO.Directory]::CreateDirectory($directory, $security)
    }
    if (![IO.Directory]::Exists($directory)) { exit 0 }
    Assert-Private $directory $true
    $existing = [IO.File]::Exists($path)
    if ($existing) {
        Assert-Private $path $false
        if (([IO.FileInfo]::new($path)).Length -gt 256) { throw 'IPC descriptor size' }
    }
    if ($Action -eq 'read') {
        if ($existing) { [Console]::Write([IO.File]::ReadAllText($path)) }
        exit 0
    }
    $value = [Console]::ReadLine()
    if (!$value -or $value -notmatch '^\{"v":1,"port":[1-9][0-9]{0,4},"key":"[0-9a-f]{64}"\}$') { throw 'IPC descriptor' }
    if ($Action -eq 'clear') {
        if ($existing -and [IO.File]::ReadAllText($path) -ceq $value) {
            [IO.File]::Delete($path)
            if ($TestNamespace) { [IO.Directory]::Delete($directory, $false) }
        }
        exit 0
    }
    $temp = Join-Path $directory ([Guid]::NewGuid().ToString('N') + '.tmp')
    $backup = $temp + '.previous'
    try {
        $security = [Security.AccessControl.FileSecurity]::new()
        $security.SetAccessRuleProtection($true, $false)
        $security.SetOwner($identity.User)
        $security.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'Allow'))
        $file = [IO.FileStream]::new($temp, 'CreateNew', 'Write', 'None', 4096, 'None', $security)
        try {
            $bytes = [Text.Encoding]::ASCII.GetBytes($value)
            $file.Write($bytes, 0, $bytes.Length)
        } finally { $file.Dispose() }
        Assert-Private $temp $false
        if ($existing) { [IO.File]::Replace($temp, $path, $backup) }
        else { [IO.File]::Move($temp, $path) }
        Assert-Private $path $false
    } finally {
        [IO.File]::Delete($temp)
        [IO.File]::Delete($backup)
    }
} catch { exit 1 }
