# Installation de l'agent de signature DSI Hub (par utilisateur, sans droits administrateur).
#  - copie DSIHubSignatureAgent.exe dans %LOCALAPPDATA%\Programs\DSIHubSignatureAgent ;
#  - le lance à chaque ouverture de session (clé HKCU\...\Run), sans fenêtre ;
#  - l'inscrit dans « Applications installées » (désinstallation possible depuis Windows).
# Usage : install.ps1            installer / mettre à jour
#         install.ps1 -Uninstall désinstaller
param(
    [switch]$Uninstall,
    [string]$TargetDir = (Join-Path $env:LOCALAPPDATA 'Programs\DSIHubSignatureAgent'),
    [switch]$NoAutostart,   # tests uniquement : ne touche pas au démarrage automatique ni à la liste des applications
    [switch]$Silent         # pas de boîte de dialogue
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

$name = 'DSIHubSignatureAgent'
$exeName = "$name.exe"
$version = '1.1.0'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$name"

function Show-Message([string]$text, [string]$icon = 'Information') {
    if ($Silent) { Write-Output $text; return }
    [void][System.Windows.Forms.MessageBox]::Show($text, 'Agent de signature DSI Hub', 'OK', $icon)
}
function Stop-Agent {
    Get-Process -Name $name -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$TargetDir*" } | Stop-Process -Force
    Start-Sleep -Milliseconds 600
}

try {
    if ($Uninstall) {
        Stop-Agent
        if (-not $NoAutostart) {
            Remove-ItemProperty -Path $runKey -Name $name -ErrorAction SilentlyContinue
            Remove-Item -Path $uninstallKey -Recurse -ErrorAction SilentlyContinue
        }
        # Le journal et la configuration sont conservés ; les fichiers du programme sont supprimés
        Get-ChildItem -Path $TargetDir -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'agent.config.json' } | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
        Show-Message "L'agent de signature a été désinstallé."
        exit 0
    }

    $src = Split-Path -Parent $MyInvocation.MyCommand.Path
    if (-not (Test-Path (Join-Path $src $exeName))) { throw "$exeName introuvable à côté du programme d'installation." }

    Stop-Agent
    New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
    Copy-Item (Join-Path $src $exeName) $TargetDir -Force
    # Copie du script : sert à la désinstallation depuis « Applications installées »
    Copy-Item $MyInvocation.MyCommand.Path (Join-Path $TargetDir 'install.ps1') -Force
    $exe = Join-Path $TargetDir $exeName

    if (-not $NoAutostart) {
        Set-ItemProperty -Path $runKey -Name $name -Value "`"$exe`""
        New-Item -Path $uninstallKey -Force | Out-Null
        Set-ItemProperty -Path $uninstallKey -Name DisplayName -Value 'Agent de signature DSI Hub'
        Set-ItemProperty -Path $uninstallKey -Name DisplayVersion -Value $version
        Set-ItemProperty -Path $uninstallKey -Name Publisher -Value "Ville d'Ivry-sur-Seine - DSI"
        Set-ItemProperty -Path $uninstallKey -Name InstallLocation -Value $TargetDir
        Set-ItemProperty -Path $uninstallKey -Name DisplayIcon -Value $exe
        Set-ItemProperty -Path $uninstallKey -Name UninstallString -Value "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $TargetDir 'install.ps1')`" -Uninstall"
        Set-ItemProperty -Path $uninstallKey -Name NoModify -Value 1 -Type DWord
        Set-ItemProperty -Path $uninstallKey -Name NoRepair -Value 1 -Type DWord
    }

    Start-Process -FilePath $exe -WindowStyle Hidden

    # Vérification : l'agent doit répondre (port 47821, ou AGENT_PORT en test)
    $port = if ($env:AGENT_PORT) { $env:AGENT_PORT } else { '47821' }
    $ok = $false
    for ($i = 0; $i -lt 12 -and -not $ok; $i++) {
        Start-Sleep -Milliseconds 500
        try { $ok = (Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$port/status" -TimeoutSec 2).StatusCode -eq 200 } catch { $ok = $false }
    }
    if ($ok) {
        Show-Message "L'agent de signature est installé et démarre automatiquement à l'ouverture de session.`n`nBranchez votre clé, puis ouvrez le lien de signature du Parapheur."
    } else {
        Show-Message "Installé, mais l'agent ne répond pas.`nConsultez le journal : $env:LOCALAPPDATA\DSIHubSignatureAgent\agent.log" 'Warning'
        exit 1
    }
} catch {
    Show-Message "Échec : $($_.Exception.Message)" 'Error'
    exit 1
}
