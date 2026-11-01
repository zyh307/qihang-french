$ErrorActionPreference = 'Stop'
$oralRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$oralPython = if ($env:QIHANG_ORAL_PYTHON) { $env:QIHANG_ORAL_PYTHON } else { Join-Path $oralRoot '.venv/Scripts/python.exe' }
if (-not (Test-Path -LiteralPath $oralPython)) {
    $oralPython = (Get-Command python -ErrorAction Stop).Source
}
Set-Location -LiteralPath $oralRoot
try {
    $oralHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:8127/api/health' -TimeoutSec 2
    if ($oralHealth.build -eq '20261031-a1-web-0.1.0-r7') {
        Start-Process 'http://127.0.0.1:8127/'
        exit
    }
    throw '8127 端口已被其他版本使用，请先关闭对应服务。'
} catch {
    if ($_.Exception.Message -like '*其他版本*') { throw }
}
& $oralPython (Join-Path $oralRoot 'launch.py')
