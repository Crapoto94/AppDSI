; Installateur « traditionnel » de l'agent de signature DSI Hub (Inno Setup 6).
; Compilation : "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" setup.iss   (après : node build-exe.js)
; Installation par utilisateur : aucun droit administrateur requis.

#define AppName "Agent de signature DSI Hub"
#define AppExe "DSIHubSignatureAgent.exe"
#define AppVersion "1.2.0"

[Setup]
AppId={{6F1B6F43-2A0E-4C2B-9E1D-5D3A7C9B1E42}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Ville d'Ivry-sur-Seine - DSI
DefaultDirName={localappdata}\Programs\DSIHubSignatureAgent
DisableProgramGroupPage=yes
DisableDirPage=auto
PrivilegesRequired=lowest
OutputDir=dist
OutputBaseFilename=DSIHubSignatureAgent-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\{#AppExe}
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "autostart"; Description: "Lancer l'agent automatiquement à l'ouverture de session Windows (recommandé)"; GroupDescription: "Démarrage :"

[Files]
Source: "dist\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion
Source: "agent.config.example.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "DSIHubSignatureAgent"; ValueData: """{app}\{#AppExe}"""; Flags: uninsdeletevalue; Tasks: autostart
; Ancienne entrée « Applications installées » créée par le premier installateur (install.ps1) : évite un doublon
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Uninstall\DSIHubSignatureAgent"; Flags: deletekey

[Run]
Filename: "{app}\{#AppExe}"; Description: "Démarrer l'agent maintenant"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{cmd}"; Parameters: "/C taskkill /F /IM {#AppExe}"; Flags: runhidden; RunOnceId: "StopAgent"

[Code]
// Arrête l'agent en cours d'exécution avant de remplacer ses fichiers (mise à jour)
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep = ssInstall then
    Exec(ExpandConstant('{cmd}'), '/C taskkill /F /IM {#AppExe}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;
