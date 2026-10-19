!macro customCheckAppRunning
  ; The default check asks PowerShell whether any process path starts with the
  ; install directory. 应用宝 Wine reports that query as successful even when
  ; GameBuddy.exe is not running, so the installer cannot continue.
  ; Match the executable name in tasklist output instead, and ignore a failed
  ; or empty command.
  nsExec::ExecToStack `"$SYSDIR\cmd.exe" /C tasklist /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /FO CSV /NH`
  Pop $0
  Pop $1
  StrCpy $2 "$\"${APP_EXECUTABLE_FILENAME}"
  StrLen $3 $2
  StrCpy $4 $1 $3
  ${If} $4 == $2
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK customStopApp
    Quit
    customStopApp:
      nsExec::Exec `taskkill /F /IM "${APP_EXECUTABLE_FILENAME}"`
      Sleep 500
  ${EndIf}
!macroend
