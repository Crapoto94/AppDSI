# Construit dist\DSIHubSignatureAgent-Setup.exe (installateur auto-extractible, outil Windows IExpress).
# Prérequis : dist\DSIHubSignatureAgent.exe (node build-exe.js).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist = Join-Path $root 'dist'
if (-not (Test-Path (Join-Path $dist 'DSIHubSignatureAgent.exe'))) { throw "Lancez d'abord : node build-exe.js" }
Copy-Item (Join-Path $root 'install.ps1') $dist -Force

$setup = Join-Path $dist 'DSIHubSignatureAgent-Setup.exe'
Remove-Item $setup -ErrorAction SilentlyContinue
$sed = Join-Path $dist 'setup.sed'
@"
[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=0
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=$setup
FriendlyName=Agent de signature DSI Hub
AppLaunched=powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File install.ps1
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
SourceFiles=SourceFiles
[Strings]
FILE0="DSIHubSignatureAgent.exe"
FILE1="install.ps1"
[SourceFiles]
SourceFiles0=$dist\
[SourceFiles0]
%FILE0%=
%FILE1%=
"@ | Set-Content -Path $sed -Encoding ASCII

& "$env:WINDIR\System32\iexpress.exe" /N /Q $sed | Out-Null
for ($i = 0; $i -lt 40 -and -not (Test-Path $setup); $i++) { Start-Sleep -Milliseconds 500 }
Remove-Item $sed -ErrorAction SilentlyContinue
if (-not (Test-Path $setup)) { throw "IExpress n'a pas produit l'installateur." }
Write-Output ("Installateur prêt : {0} ({1:N0} Mo)" -f $setup, ((Get-Item $setup).Length / 1MB))
