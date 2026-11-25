; Scream Adaptive Wallpaper - 1-Click Per-User Windows Setup Installer (Inno Setup 6)
; Double-click Scream-v1.0.0-Setup-x64.exe -> installs automatically in ~3 seconds -> launches Scream immediately!
; Zero UAC Admin prompt, zero Next-Next-Next wizard steps, clean Start Menu & Desktop shortcuts, clean uninstall.

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
; True 1-step install (like Discord / Cursor / Notion): skip all repetitive wizard pages!
DisableWelcomePage=yes
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
DisableFinishedPage=yes
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

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall {#MyAppShortName}"; Filename: "{uninstallexe}"
Name: "{userdesktop}\{#MyAppShortName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"

[Registry]
; Clean up Windows Auto-Start key automatically on uninstall (if user enabled it inside Scream Settings)
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: none; ValueName: "ScreamWallpaper"; Flags: uninsdeletevalue

[Run]
; Interactive install: open Scream normally (shows Settings window)
Filename: "{app}\{#MyAppExeName}"; Flags: nowait postinstall skipifsilent
; Silent auto-update (/VERYSILENT): relaunch Scream automatically (background --autostart or interactive per flag)
Filename: "{app}\{#MyAppExeName}"; Parameters: "{code:GetRelaunchParams}"; Flags: nowait skipifnotsilent

[Code]
const
  WebView2RegKey = 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';
  WebView2Url    = 'https://go.microsoft.com/fwlink/p/?LinkId=2124703';

function GetRelaunchParams(Param: String): String;
begin
  if ExpandConstant('{param:SCREAM_SILENT_LAUNCH|0}') = '1' then
    Result := '--autostart'
  else
    Result := '';
end;

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
  if (CurStep = ssPostInstall) and (not WizardSilent) and (not IsWebView2Installed()) then
  begin
    if MsgBox(
      'Microsoft Edge WebView2 Runtime was not detected on this PC.' + #13#10 +
      'Scream requires WebView2 Runtime (free, ~2 MB installer from Microsoft) to render wallpapers.' + #13#10#13#10 +
      'Open the official Microsoft WebView2 download page now?',
      mbConfirmation, MB_YESNO) = IDYES then
    begin
      ShellExec('open', WebView2Url, '', '', SW_SHOWNORMAL, ewNoWait, ErrCode);
    end;
  end;
end;
