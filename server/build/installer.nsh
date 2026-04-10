!macro terminateLegacyServerArtifacts
  DetailPrint "Stopping AdvertisingScreenServer.exe if it is still running"
  nsExec::ExecToLog 'taskkill /F /IM AdvertisingScreenServer.exe /T'
  Pop $0

  DetailPrint "Removing stale AdvertisingScreenServer auto-start registry entry"
  nsExec::ExecToLog 'reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "AdvertisingScreenServer" /f'
  Pop $0

  Sleep 1500
!macroend

!macro customInit
  !insertmacro terminateLegacyServerArtifacts
!macroend

!macro customUnInstall
  !insertmacro terminateLegacyServerArtifacts
!macroend
