# Serviço por usuário, sem senha e sem terminal aberto. O servidor existente continua no Docker.
[CmdletBinding()]
param(
    [ValidateSet('Install', 'Run', 'Status', 'Uninstall')][string]$Action = 'Status',
    [ValidateRange(1, 65535)][int]$Port = 4747,
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_.-]*$')][string]$Container = 'habblaud',
    [string]$Node = ''
)

$ErrorActionPreference = 'Stop'
$taskName = "Habblaud Codex Bridge $Port"
$projectRoot = Split-Path $PSScriptRoot -Parent
$runtimeDir = Join-Path $env:LOCALAPPDATA "Habblaud\bridge-$Port"
$baseUrl = "http://127.0.0.1:$Port"
$supervisorLog = Join-Path $runtimeDir 'service.log'
$processFile = Join-Path $runtimeDir 'bridge-process.json'

function Stop-OwnedBridge {
    if (-not (Test-Path -LiteralPath $processFile)) { return }
    $record = Get-Content -LiteralPath $processFile -Raw | ConvertFrom-Json
    $process = Get-Process -Id $record.Pid -ErrorAction SilentlyContinue
    if (-not $process) { return }
    $info = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.Id)"
    # Nunca encerra um PID reaproveitado nem outro Node do usuário.
    if ($process.StartTime.ToUniversalTime().Ticks -ne $record.StartTicks -or
        $info.ExecutablePath -ne $record.Node -or
        -not $info.CommandLine.Contains('"' + $record.Bridge + '"')) {
        throw 'O PID registrado pertence a outro processo. Nada foi encerrado.'
    }
    Stop-Process -Id $process.Id
}

function Write-ServiceLog([string]$Message) {
    if ((Test-Path -LiteralPath $supervisorLog) -and (Get-Item -LiteralPath $supervisorLog).Length -gt 1MB) {
        Move-Item -LiteralPath $supervisorLog -Destination "$supervisorLog.1" -Force
    }
    Add-Content -LiteralPath $supervisorLog -Value "$(Get-Date -Format o) $Message" -Encoding UTF8
}

function Get-Health {
    try { return Invoke-RestMethod "$baseUrl/api/health" -TimeoutSec 3 } catch { return $null }
}

if ($Action -eq 'Status') {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    $health = Get-Health
    $ready = 0
    try {
        $snapshot = Invoke-RestMethod "$baseUrl/api/snapshot" -TimeoutSec 3
        $ready = @($snapshot.agents | Where-Object { $_.provider -eq 'codex' -and $_.canMessage }).Count
    } catch { }
    [pscustomobject]@{
        Task = $taskName
        State = if ($task) { $task.State.ToString() } else { 'NotInstalled' }
        Server = [bool]$health.ok
        Messages = [bool]$health.messages
        ReadyCodexSessions = $ready
        Logs = $runtimeDir
    } | ConvertTo-Json
    exit 0
}

if ($Action -eq 'Uninstall') {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($task) {
        Stop-ScheduledTask -TaskName $taskName
        Stop-OwnedBridge
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }
    Write-Output 'Inicialização automática removida. O container, os hooks e os logs foram preservados.'
    exit 0
}

if (-not $Node) { $Node = (Get-Command node.exe -ErrorAction Stop).Source }
$Node = (Resolve-Path -LiteralPath $Node).Path
$bridge = Join-Path $projectRoot 'scripts\codex-bridge.ts'
$loader = Join-Path $projectRoot 'node_modules\tsx\dist\loader.mjs'
if (-not (Test-Path -LiteralPath $loader)) { throw 'Dependências ausentes. Rode npm ci nesta pasta.' }
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

if ($Action -eq 'Install') {
    $scriptPath = $MyInvocation.MyCommand.Path
    foreach ($value in @($scriptPath, $Node)) {
        if ($value.Contains('"')) { throw 'Caminho com aspas não suportado.' }
    }
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $arguments = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`" -Action Run -Port $Port -Container $Container -Node `"$Node`""
    $taskAction = New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $projectRoot
    $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
    $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existing) {
        Export-ScheduledTask -TaskName $taskName | Set-Content -LiteralPath (Join-Path $runtimeDir "task-backup-$(Get-Date -Format yyyyMMddHHmmss).xml") -Encoding UTF8
        Stop-ScheduledTask -TaskName $taskName
        Stop-OwnedBridge
        # Stop-ScheduledTask é assíncrono; IgnoreNew descartaria um início enquanto a execução anterior termina.
        for ($attempt = 0; $attempt -lt 40 -and (Get-ScheduledTask -TaskName $taskName).State -eq 'Running'; $attempt++) { Start-Sleep -Milliseconds 250 }
        if ((Get-ScheduledTask -TaskName $taskName).State -eq 'Running') { throw 'A execução anterior ainda está encerrando. Tente instalar novamente.' }
    }
    Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $trigger -Principal $principal -Settings $settings -Description 'Mantém o Habblaud e a entrega de mensagens ao Codex disponíveis neste usuário.' -Force | Out-Null
    Start-ScheduledTask -TaskName $taskName
    Write-Output "Inicialização automática instalada e iniciada: $taskName. Logs: $runtimeDir"
    exit 0
}

# O mutex também protege contra duas execuções manuais deste supervisor.
$mutex = New-Object System.Threading.Mutex($false, "Local\HabblaudCodexBridge$Port")
$ownsMutex = $false
$child = $null
try {
    try { $ownsMutex = $mutex.WaitOne(10000) } catch [System.Threading.AbandonedMutexException] { $ownsMutex = $true }
    if (-not $ownsMutex) { exit 0 }
    Write-ServiceLog 'Supervisor iniciado.'
    $loaderUrl = ([System.Uri]$loader).AbsoluteUri
    $childArgs = "--import `"$loaderUrl`" `"$bridge`" --port $Port"
    $lastDockerAttempt = [DateTime]::MinValue
    while ($true) {
        $health = Get-Health
        # Não substitui nem recria containers. Só inicia a instalação que já existe.
        if (-not $health -and ([DateTime]::UtcNow - $lastDockerAttempt).TotalSeconds -ge 30) {
            $lastDockerAttempt = [DateTime]::UtcNow
            $docker = Get-Command docker.exe -ErrorAction SilentlyContinue
            if ($docker) {
                $previousPreference = $ErrorActionPreference
                $ErrorActionPreference = 'Continue'
                $running = & $docker.Source inspect --format '{{.State.Running}}' $Container 2>$null
                $inspectCode = $LASTEXITCODE
                if ($inspectCode -eq 0 -and $running -eq 'false') {
                    & $docker.Source start $Container 2>$null | Out-Null
                    Write-ServiceLog 'Container existente iniciado.'
                } elseif ($inspectCode -ne 0) {
                    # Só abre o Docker Desktop se o processo não estiver rodando.
                    $desktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
                    if ((Test-Path -LiteralPath $desktop) -and -not (Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue)) {
                        Start-Process -FilePath $desktop -WindowStyle Hidden
                        Write-ServiceLog 'Docker Desktop iniciado; aguardando o servidor.'
                    }
                }
                $ErrorActionPreference = $previousPreference
            }
        }
        if ($health.ok -and $health.messages) {
            if (-not $child -or $child.HasExited) {
                foreach ($name in @('bridge.log', 'bridge-error.log')) {
                    $path = Join-Path $runtimeDir $name
                    if ((Test-Path -LiteralPath $path) -and (Get-Item -LiteralPath $path).Length -gt 0) { Move-Item -LiteralPath $path -Destination "$path.1" -Force }
                }
                $child = Start-Process -FilePath $Node -ArgumentList $childArgs -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'bridge.log') -RedirectStandardError (Join-Path $runtimeDir 'bridge-error.log')
                @{ Pid = $child.Id; StartTicks = $child.StartTime.ToUniversalTime().Ticks; Node = $Node; Bridge = $bridge } | ConvertTo-Json | Set-Content -LiteralPath $processFile -Encoding UTF8
                Write-ServiceLog "Bridge iniciado (PID $($child.Id))."
            }
        }
        Start-Sleep -Seconds 5
    }
} finally {
    if ($child -and -not $child.HasExited) { Stop-Process -Id $child.Id -ErrorAction SilentlyContinue }
    if ($ownsMutex) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
