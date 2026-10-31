param([int]$Port = 5190, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$qihangRoot = Join-Path $PSScriptRoot '网页'
$qihangUrl = "http://127.0.0.1:$Port/"
$qihangListener = $null

function Send-QihangResponse {
    param([IO.Stream]$Stream, [int]$Status, [string]$Mime, [byte[]]$Body, [bool]$HeadOnly)
    $reason = switch ($Status) {200 {'OK'} 400 {'Bad Request'} 404 {'Not Found'} 405 {'Method Not Allowed'} default {'Error'}}
    $headers = "HTTP/1.1 $Status $reason`r`nContent-Type: $Mime`r`nContent-Length: $($Body.Length)`r`nCache-Control: no-cache`r`nX-Content-Type-Options: nosniff`r`nX-Qihang-App: cap-sur-le-francais`r`nConnection: close`r`n`r`n"
    $bytes = [Text.Encoding]::ASCII.GetBytes($headers)
    $Stream.Write($bytes, 0, $bytes.Length)
    if (-not $HeadOnly -and $Body.Length) {$Stream.Write($Body, 0, $Body.Length)}
    $Stream.Flush()
}

try {
    if (-not (Test-Path -LiteralPath (Join-Path $qihangRoot 'index.html'))) {throw '网页文件缺失，请完整解压后再打开。'}
    # Reuse a previously started copy. Keep a fixed origin so existing records remain accessible.
    try {
        $existing = Invoke-WebRequest -Uri ($qihangUrl + '__qihang_health') -UseBasicParsing -TimeoutSec 2
        if ($existing.Headers['X-Qihang-App'] -eq 'cap-sur-le-francais' -and ($existing.Content | ConvertFrom-Json).version -eq '1.0.22') {
            if (-not $NoBrowser) {Start-Process $qihangUrl}
            exit 0
        }
    } catch {}
    $qihangListener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $Port)
    try {$qihangListener.Start()} catch {throw "端口 $Port 正在使用，请关闭已有的开发预览后重试。"}
    if (-not $NoBrowser) {Start-Process $qihangUrl}
    $mimeTypes = @{
        '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'
        '.json'='application/json; charset=utf-8'; '.svg'='image/svg+xml'; '.png'='image/png'; '.jpg'='image/jpeg'
        '.jpeg'='image/jpeg'; '.webp'='image/webp'; '.gif'='image/gif'; '.ico'='image/x-icon'; '.woff'='font/woff'
        '.woff2'='font/woff2'; '.ttf'='font/ttf'; '.mp3'='audio/mpeg'; '.wasm'='application/wasm'; '.txt'='text/plain; charset=utf-8'; '.zip'='application/zip'
    }
    $qihangFullRoot = [IO.Path]::GetFullPath($qihangRoot).TrimEnd('\') + '\'
    while ($true) {
        $client = $qihangListener.AcceptTcpClient()
        $stream = $null
        $reader = $null
        try {
            $client.ReceiveTimeout = 4000
            $client.SendTimeout = 10000
            $client.NoDelay = $true
            $stream = $client.GetStream()
            $reader = New-Object IO.StreamReader($stream, [Text.Encoding]::ASCII, $false, 4096, $true)
            $requestLine = $reader.ReadLine()
            if (-not $requestLine) {continue}
            if ($requestLine.Length -gt 8192 -or $requestLine -notmatch '^(GET|HEAD) (/[^ ]*) HTTP/1\.[01]$') {
                Send-QihangResponse $stream 405 'text/plain' ([Text.Encoding]::UTF8.GetBytes('Method not allowed')) $false
                continue
            }
            $headOnly = $Matches[1] -eq 'HEAD'
            $target = $Matches[2]
            $headerSize = 0
            do {
                $line = $reader.ReadLine()
                if ($null -eq $line) {throw 'Incomplete request'}
                $headerSize += $line.Length
                if ($headerSize -gt 65536) {throw 'Headers too large'}
            } while ($line.Length)
            $path = [Uri]::UnescapeDataString(($target -split '\?', 2)[0])
            if ($path -eq '/__qihang_health') {
                Send-QihangResponse $stream 200 'application/json' ([Text.Encoding]::UTF8.GetBytes('{"app":"cap-sur-le-francais","version":"1.0.22"}')) $headOnly
                continue
            }
            if ($path -match '[\x00-\x1F\\:]' -or ($path -split '/') -contains '..') {
                Send-QihangResponse $stream 400 'text/plain' ([Text.Encoding]::UTF8.GetBytes('Invalid path')) $headOnly
                continue
            }
            $file = [IO.Path]::GetFullPath((Join-Path $qihangRoot $path.TrimStart('/')))
            if ($path -eq '/') {$file = Join-Path $qihangRoot 'index.html'}
            if (-not $file.StartsWith($qihangFullRoot, [StringComparison]::OrdinalIgnoreCase)) {
                Send-QihangResponse $stream 400 'text/plain' ([Text.Encoding]::UTF8.GetBytes('Invalid path')) $headOnly
                continue
            }
            if (-not (Test-Path -LiteralPath $file -PathType Leaf) -and -not [IO.Path]::GetExtension($file)) {$file = Join-Path $qihangRoot 'index.html'}
            $extension = [IO.Path]::GetExtension($file).ToLowerInvariant()
            if (-not (Test-Path -LiteralPath $file -PathType Leaf) -or -not $mimeTypes.ContainsKey($extension)) {
                Send-QihangResponse $stream 404 'text/plain' ([Text.Encoding]::UTF8.GetBytes('Not found')) $headOnly
                continue
            }
            Send-QihangResponse $stream 200 $mimeTypes[$extension] ([IO.File]::ReadAllBytes($file)) $headOnly
        } catch {
            # A closed browser connection must not stop subsequent requests.
        } finally {
            if ($reader) {$reader.Dispose()}
            if ($stream) {$stream.Dispose()}
            $client.Close()
        }
    }
} catch {
    if ($NoBrowser) {Write-Error $_; exit 1}
    Add-Type -AssemblyName System.Windows.Forms
    [void][System.Windows.Forms.MessageBox]::Show($_.Exception.Message, '启航法语', 'OK', 'Error')
    exit 1
} finally {
    if ($qihangListener) {$qihangListener.Stop()}
}
