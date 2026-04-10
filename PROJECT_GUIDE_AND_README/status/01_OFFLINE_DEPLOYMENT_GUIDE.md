# Offline Deployment

For isolated intranet environments, do not ship the source tree as the primary delivery.

## Final delivery rule

1. Final installer delivery is standardized to the project root `windows/` directory.
2. `windows/` must contain only these two files:
   - `AdvertisingScreenServer-Setup-1.0.0.exe`
   - `AdvertisingScreenClient-Setup-1.0.0.exe`
3. When a new build is produced from `server/dist` or `client/dist`, it must overwrite the corresponding file in `windows/`.
4. No extra files are allowed in `windows/`:
   - no old versions
   - no `.blockmap`
   - no portable folders
   - no temporary packaging artifacts

## Required launch behavior

The packaged apps are valid only if the installed launch behavior matches this standard:

1. Double-clicking the server app must directly enter the web admin console.
2. Double-clicking the client app must directly enter the player test page that shows the pairing code / waiting-for-server state.
3. This launch behavior must be verified before the final `.exe` files are copied into `windows/`.

## Build-time issues and packaged regressions

The following problems have already occurred during packaging and must be checked every time a new build is produced:

1. Packaged path regression:
   - Symptom: startup fails with `ENOTDIR, not a directory`
   - Cause: packaged app tried to read/write `storage`, `logs`, or `.env` under `resources/app.asar`
   - Fix: packaged server/client writable paths were moved to `AppData` or `path.dirname(process.execPath)` as appropriate
2. Missing packaged frontend updates:
   - Symptom: source code looked fixed, but installed app still behaved like the old version
   - Cause: the final `windows/` installer was older than the latest source edits
   - Fix: always compare source edit time, `dist/win-unpacked/resources/app.asar`, installed `resources/app.asar`, and the final `windows/` exe timestamp
3. Admin UI stale cache:
   - Symptom: admin page kept showing old upload/delete behavior after reinstall
   - Cause: browser cached the admin HTML/JS
   - Fix: packaged server now serves the admin UI with `Cache-Control: no-store`
4. Asset delete false errors:
   - Symptom: clicking delete removed the card, then showed `Asset not found`
   - Cause: frontend optimistic removal conflicted with a strict backend delete route
   - Fix: asset delete is now idempotent and the frontend refreshes the current directory after delete
5. Upload preflight selection list missing:
   - Symptom: files were chosen but the upload area still showed nothing before upload
   - Cause: installed frontend was still using an older hidden selection panel
   - Fix: the selection panel is now always present and updated on file/folder `change`
6. Client push succeeded but playback did not start:
   - Symptom: server showed push completed, but the remote client stayed idle
   - Cause: SMB push path and packaged client local read path diverged
   - Fix: client now falls back to HTTP cache download when staged local media is unavailable
7. Installer blocked by stale process:
   - Symptom: installer reported same-name process still running even after user thought it was closed
   - Cause: Electron child processes / autorun entries / scheduled tasks survived between installs
   - Fix: NSIS installer scripts now terminate stale processes and remove stale autorun/task entries before install

## Mandatory post-build verification

Every build must be verified in this order before the `windows/` folder is considered valid:

1. Confirm the latest `dist` installer timestamp is newer than the edited source files.
2. Inspect `dist/win-unpacked/resources/app.asar` when the fix targets packaged HTML/JS behavior.
3. Install and launch the packaged app.
4. Re-check installed `resources/app.asar` if packaged behavior still differs from source.
5. Only after behavior matches expectation, overwrite the two final installers in `windows/`.

## Internal staging paths

These paths can still exist for build or bootstrap flow, but they are not the final handoff location for acceptance:

1. Installer staging:
   - `server/offline/packages`
   - `client/offline/packages`
2. Portable staging:
   - `server/offline/portable`
   - `client/offline/portable`
3. Optional prerequisite installers:
   - `server/offline/prereqs`
   - `client/offline/prereqs`

## Bootstrap behavior

The offline bootstrap script does this:

1. Installs every bundled prerequisite in `offline/prereqs`
2. Checks whether the app is already installed
3. If not installed, tries the local portable app in `offline/portable`
4. If still not found, installs the newest package from `offline/packages`
5. Launches the resolved app

## Notes

- User-facing acceptance should always use the two `.exe` files in `windows/`.
- Electron runtime is already bundled in the built app installer.
- If a prerequisite is already installed, re-running the offline bootstrap is usually harmless, but package-specific installer behavior still applies.
