; Scream Adaptive Wallpaper - Inno Setup 6 Per-User Installer Script
; Produces a compressed (~50 MB) single-file Windows x64 Setup installer requiring ZERO Admin (UAC) rights.
; Usage: ISCC.exe /DMyAppVersion=1.0.0 installer\Scream.iss

#ifndef MyAppVersion
  #define MyAppVersion "1.0.0"
#endif

#define MyAppName      "Scream Adaptive Wallpaper"
#define MyAppShortName "Scream"
#define MyAppPublisher "Scream"
#define MyAppExeName   "Scream.exe"
#define SourceDir      "..\dist\Scream-Portable"

[Setup]
AppId={{8E9B7F42-5C2A-4D63-A821-3B9C7F14E205}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\{#MyAppShortName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
; Modern Per-User install (just like VS Code, Discord, Cursor - zero UAC Admin prompt!)
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist
OutputBaseFilename=Scream-v{#MyAppVersion}-Setup-x64
SetupIconFile=..\host\scream.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &Desktop shortcut"; GroupDescription: "Additional shortcuts:"
Name: "autostart"; Description: "Start Scream automatically with &Windows"; GroupDescription: "Startup:"; Flags: unchecked

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall {#MyAppShortName}"; Filename: "{uninstallexe}"
Name: "{userdesktop}\{#MyAppShortName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
; Optional Launch on Windows Sign-In (mirrors SettingsRepository.cs RunValueName = "ScreamWallpaper")
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "ScreamWallpaper"; ValueData: """{app}\{#MyAppExeName}"" --autostart"; Flags: uninsdeletevalue; Tasks: autostart
; Ensure Run key is ALWAYS cleaned up on uninstall even if toggled later from inside Scream Settings!
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: none; ValueName: "ScreamWallpaper"; Flags: uninsdeletevalue

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[Code]
const
  WebView2RegKey = 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';
  WebView2Url    = 'https://go.microsoft.com/fwlink/p/?LinkId=2124703';

function IsWebView2Installed(): Boolean;
var
  Ver: String;
begin
  Result := False;
  if RegQueryStringValue(HKEY_LOCAL_MACHINE, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Ver) and (Ver <> '') and (Ver <> '0.0.0.0') then
    Result := True
  else if RegQueryStringValue(HKEY_LOCAL_MACHINE, WebView2RegKey, 'pv', Ver) and (Ver <> '') and (Ver <> '0.0.0.0') then
    Result := True
  else if RegQueryStringValue(HKEY_CURRENT_USER, WebView2RegKey, 'pv', Ver) and (Ver <> '') and (Ver <> '0.0.0.0') then
    Result := True;
end;

procedure StopRunningScream();
var
  ExePath: String;
  ResultCode: Integer;
begin
  ExePath := ExpandConstant('{app}\{#MyAppExeName}');
  if FileExists(ExePath) then
  begin
    Exec(ExePath, '--exit', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Sleep(500);
  end;
  Exec('taskkill.exe', '/F /IM {#MyAppExeName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(250);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  StopRunningScream();
  Result := '';
end;

function InitializeUninstall(): Boolean;
begin
  StopRunningScream();
  Result := True;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ErrCode: Integer;
begin
  if (CurStep = ssPostInstall) and (not IsWebView2Installed()) then
  begin
    if MsgBox(
      'Microsoft Edge WebView2 Runtime was not detected on this Windows installation.' + #13#10 +
      'Scream requires WebView2 Runtime (free, ~2 MB installer from Microsoft) to render wallpapers.' + #13#10#13#10 +
      'Open the official Microsoft WebView2 download page now?',
      mbConfirmation, MB_YESNO) = IDYES then
    begin
      ShellExec('open', WebView2Url, '', '', SW_SHOWNORMAL, ewNoWait, ErrCode);
    end;
  end;
end;
