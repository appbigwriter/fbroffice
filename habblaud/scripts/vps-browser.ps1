param([string]$Server = '76.13.168.223', [int]$Port = 6081)
$ErrorActionPreference = 'Stop'
$connection = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $connection) {
  $ssh = (Get-Command ssh.exe -ErrorAction Stop).Source
  $sshArgs = @('-N', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3', '-L', "127.0.0.1:${Port}:127.0.0.1:6080", "root@$Server")
  Start-Process -FilePath $ssh -ArgumentList $sshArgs -WindowStyle Hidden | Out-Null
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 200
    $connection = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($connection) { break }
  }
  if (-not $connection) { throw 'Nao foi possivel abrir o tunel SSH do navegador.' }
}
Write-Output "http://127.0.0.1:$Port/vnc.html"
