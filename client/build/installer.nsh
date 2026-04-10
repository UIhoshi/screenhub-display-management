!macro terminateLegacyClientArtifacts
  DetailPrint "Stopping AdvertisingScreenClient.exe if it is still running"
  nsExec::ExecToLog 'taskkill /F /IM AdvertisingScreenClient.exe /T'
  Pop $0

  DetailPrint "Removing stale AdvertisingScreenClient auto-start registry entry"
  nsExec::ExecToLog 'reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "AdvertisingScreenClient" /f'
  Pop $0

  DetailPrint "Removing stale AdvertisingScreenClient scheduled tasks"
  nsExec::ExecToLog 'schtasks.exe /Delete /TN "AdvertisingScreenClient" /F'
  Pop $0
  nsExec::ExecToLog 'schtasks.exe /Delete /TN "AdvertisingScreenClientRemoteStartWatcher" /F'
  Pop $0

  Sleep 1500
!macroend

!macro customInit
  !insertmacro terminateLegacyClientArtifacts
!macroend

!macro customUnInstall
  !insertmacro terminateLegacyClientArtifacts
!macroend
