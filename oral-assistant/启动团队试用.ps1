param([switch]$Stop,[switch]$RestartServer)
$ErrorActionPreference = 'Stop'
$oralRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$oralState = Join-Path $oralRoot '.team'
$oralRuntime = Join-Path $oralState 'runtime.json'
$oralConfig = Join-Path $oralState 'access.json'
$oralTool = Join-Path $oralRoot '.tools/cloudflared/cloudflared.exe'
$oralPython = if ($env:QIHANG_ORAL_PYTHON) { $env:QIHANG_ORAL_PYTHON } else { Join-Path $oralRoot '.venv/Scripts/python.exe' }
if (-not (Test-Path -LiteralPath $oralPython)) { $oralPython = (Get-Command python -ErrorAction Stop).Source }

function Stop-OralTrialProcess($oralPid, $oralKind) {
    if (-not $oralPid) { return }
    $oralProcess = Get-CimInstance Win32_Process -Filter ('ProcessId=' + [int]$oralPid)
    if (-not $oralProcess) { return }
    $oralExpected = if ($oralKind -eq 'server') { Join-Path $oralRoot 'trial_server.py' } else { $oralTool }
    if ($oralProcess.CommandLine -notlike ('*' + $oralExpected + '*')) { throw '进程身份不符，未停止任何进程。' }
    Stop-Process -Id ([int]$oralPid) -ErrorAction Stop
}

if ($RestartServer) {
    & $oralPython (Join-Path $oralRoot 'speech_service.py') --data-dir (Join-Path $oralState 'backend')
    if ($LASTEXITCODE -ne 0) { throw '独立法语识别未就绪。' }
    $oralOld = Get-Content -LiteralPath $oralRuntime -Raw -Encoding UTF8 | ConvertFrom-Json
    $oralHealth = Invoke-RestMethod 'http://127.0.0.1:8130/api/health' -TimeoutSec 2
    if ($oralHealth.pid -ne $oralOld.server_pid) { throw '服务身份不符，未重启。' }
    if ($oralHealth.active_window -or $oralHealth.recording -or $oralHealth.replying) { throw '有成员正在使用试用窗口，未重启。' }
    Stop-OralTrialProcess $oralOld.server_pid 'server'
    $oralBackup = Join-Path (Join-Path $oralState 'backups') ('更新前_'+(Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
    New-Item -ItemType Directory -Path $oralBackup | Out-Null
    Copy-Item -LiteralPath (Join-Path $oralState 'backend') -Destination (Join-Path $oralBackup 'backend') -Recurse
    $oralPythonw = Join-Path (Split-Path -Parent $oralPython) 'pythonw.exe'
    if (-not (Test-Path -LiteralPath $oralPythonw)) { $oralPythonw=$oralPython }
    $oralServer = Start-Process -FilePath $oralPythonw -ArgumentList @('"'+(Join-Path $oralRoot 'trial_server.py')+'"') -WorkingDirectory $oralRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $oralState 'server.stdout.log') -RedirectStandardError (Join-Path $oralState 'server.stderr.log')
    $oralOld.server_pid=$oralServer.Id
    [System.IO.File]::WriteAllText($oralRuntime,($oralOld | ConvertTo-Json),(New-Object System.Text.UTF8Encoding($false)))
    $oralReady = $false
    for ($oralAttempt=0;$oralAttempt -lt 50;$oralAttempt++) {
        try { $oralHealth=Invoke-RestMethod 'http://127.0.0.1:8130/api/health' -TimeoutSec 1; if ($oralHealth.pid -eq $oralServer.Id) { $oralReady=$true;break } } catch {}
        Start-Sleep -Milliseconds 200
    }
    if (-not $oralReady) { throw '共享后端未就绪，备份已保留，请检查.team/server.stderr.log。' }
    Write-Output '共享服务已更新，链接、试用码及原记录保持。'
    exit
}

if ($Stop) {
    if (Test-Path -LiteralPath $oralRuntime) {
        $oralOld = Get-Content -LiteralPath $oralRuntime -Raw -Encoding UTF8 | ConvertFrom-Json
        Stop-OralTrialProcess $oralOld.tunnel_pid 'tunnel'
        Stop-OralTrialProcess $oralOld.server_pid 'server'
    }
    Write-Output '团队试用已停止，原8127口语助手不受影响。'
    exit
}

& $oralPython (Join-Path $oralRoot 'speech_service.py') --data-dir (Join-Path $oralState 'backend')
if ($LASTEXITCODE -ne 0) { throw '独立法语识别未就绪，未启动共享。' }
if (-not (Test-Path -LiteralPath $oralTool)) { throw '缺少官方Cloudflared工具，请联系开发者配置。' }
if ((Get-FileHash -LiteralPath $oralTool -Algorithm SHA256).Hash -ne '2493DBC168923BB3E59E5E7716F71DECED92992EEA9ACD6E9D74F84AC7751343') { throw 'Cloudflared版本指纹不符，未启动。' }
if (Test-Path -LiteralPath $oralRuntime) {
    $oralOld = Get-Content -LiteralPath $oralRuntime -Raw -Encoding UTF8 | ConvertFrom-Json
    $oralAlive = $false
    try {
        $oralHealth = Invoke-RestMethod 'http://127.0.0.1:8130/api/health' -TimeoutSec 2
        $oralTunnelProcess = Get-Process -Id $oralOld.tunnel_pid -ErrorAction Stop
        if ($oralHealth.pid -eq $oralOld.server_pid -and $oralTunnelProcess) { $oralAlive = $true }
    } catch {}
    if ($oralAlive) {
        $oralAccess = Get-Content -LiteralPath $oralConfig -Raw -Encoding UTF8 | ConvertFrom-Json
        if (-not $oralAccess.public_origin -and (Test-Path -LiteralPath $oralOld.tunnel_log)) {
            $oralLog = Get-Content -LiteralPath $oralOld.tunnel_log -Raw -Encoding UTF8
            if ($oralLog -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
                $oralAccess.public_origin = $Matches[0]
                [System.IO.File]::WriteAllText($oralConfig,($oralAccess | ConvertTo-Json),(New-Object System.Text.UTF8Encoding($false)))
            }
        }
        if (-not $oralAccess.public_origin) { throw '隧道进程仍在启动，请稍后重新打开启动器。' }
        if ($oralAccess.expires -gt [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) {
            Write-Output ('试用链接：' + $oralAccess.public_origin)
            Write-Output ('试用码：' + $oralAccess.invite)
            Write-Output '管理员绑定入口：http://127.0.0.1:8130/'
            exit
        }
        throw '试用已到期。请先用 -Stop 停止，再重新启动。'
    }
    Stop-OralTrialProcess $oralOld.tunnel_pid 'tunnel'
    Stop-OralTrialProcess $oralOld.server_pid 'server'
}
foreach ($oralPort in @(8128,8130)) {
    $oralProbe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,$oralPort)
    try { $oralProbe.Start() } catch { throw ('端口 ' + $oralPort + ' 已被占用，未启动。') } finally { $oralProbe.Stop() }
}
New-Item -ItemType Directory -Path $oralState -Force | Out-Null
$oralBytes = New-Object byte[] 12
$oralRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$oralRng.GetBytes($oralBytes)
$oralRng.Dispose()
$oralInvite = [Convert]::ToBase64String($oralBytes).Replace('+','-').Replace('/','_')
$oralAccess = @{invite=$oralInvite;public_origin='';expires=([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()+86400)}
$oralUtf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($oralConfig, ($oralAccess | ConvertTo-Json), $oralUtf8)
$oralBackend = Join-Path $oralState 'backend'
New-Item -ItemType Directory -Path $oralBackend -Force | Out-Null
if ((Test-Path -LiteralPath (Join-Path $oralRoot '.local/asr.json')) -and -not (Test-Path -LiteralPath (Join-Path $oralBackend 'asr.json'))) {
    Copy-Item -LiteralPath (Join-Path $oralRoot '.local/asr.json') -Destination (Join-Path $oralBackend 'asr.json')
}
$oralPythonw = Join-Path (Split-Path -Parent $oralPython) 'pythonw.exe'
if (-not (Test-Path -LiteralPath $oralPythonw)) { $oralPythonw = $oralPython }
$oralServer = Start-Process -FilePath $oralPythonw -ArgumentList @('"'+(Join-Path $oralRoot 'trial_server.py')+'"') -WorkingDirectory $oralRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $oralState 'server.stdout.log') -RedirectStandardError (Join-Path $oralState 'server.stderr.log')
$oralReady = $false
for ($oralAttempt=0;$oralAttempt -lt 50;$oralAttempt++) {
    try { $oralHealth=Invoke-RestMethod 'http://127.0.0.1:8130/api/health' -TimeoutSec 1; if ($oralHealth.pid -eq $oralServer.Id) { $oralReady=$true;break } } catch {}
    Start-Sleep -Milliseconds 200
}
if (-not $oralReady) { Stop-OralTrialProcess $oralServer.Id 'server';throw '团队服务未启动，请查看.team/server.stderr.log。' }
$oralTunnelLog = Join-Path $oralState ('tunnel-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
$oralTunnel = Start-Process -FilePath $oralTool -ArgumentList @('tunnel','--url','http://127.0.0.1:8128','--protocol','http2','--no-autoupdate','--logfile',('"'+$oralTunnelLog+'"')) -WorkingDirectory $oralRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $oralState 'tunnel.stdout.log') -RedirectStandardError (Join-Path $oralState 'tunnel.stderr.log')
$oralRun = @{server_pid=$oralServer.Id;tunnel_pid=$oralTunnel.Id;tunnel_log=$oralTunnelLog}
[System.IO.File]::WriteAllText($oralRuntime, ($oralRun | ConvertTo-Json), $oralUtf8)
$oralPublic = ''
for ($oralAttempt=0;$oralAttempt -lt 90;$oralAttempt++) {
    if (Test-Path -LiteralPath $oralTunnelLog) {
        $oralLog = Get-Content -LiteralPath $oralTunnelLog -Raw -Encoding UTF8
        if ($oralLog -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $oralPublic=$Matches[0];break }
    }
    if ($oralTunnel.HasExited) { break }
    Start-Sleep -Seconds 1
}
if (-not $oralPublic) {
    Stop-OralTrialProcess $oralTunnel.Id 'tunnel'
    Stop-OralTrialProcess $oralServer.Id 'server'
    throw '未获取到HTTPS试用链接，请检查网络后重试。'
}
$oralAccess.public_origin = $oralPublic
[System.IO.File]::WriteAllText($oralConfig, ($oralAccess | ConvertTo-Json), $oralUtf8)
Write-Output ('试用链接：' + $oralPublic)
Write-Output ('试用码：' + $oralInvite)
Write-Output '管理员绑定入口：http://127.0.0.1:8130/'
Write-Output '有效期24小时；电脑须保持开机联网。重新启动共享可能生成新链接。'
