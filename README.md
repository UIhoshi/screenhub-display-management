# screenhub-display-management

This repository contains the `v1.0.1-stable` source baseline for the Advertising Screen display management project.

## Contents

- `client/`
  - Electron client source, build config, package metadata, and offline launch helper
- `server/`
  - Electron server source, build config, package metadata, and offline launch helper
- `PROJECT_GUIDE_AND_README/`
  - Project architecture, deployment, refactoring, and history documentation

## v1.0.1-stable highlights

- Client startup cleanup for conflicting instances, legacy auto-start entries, scheduled tasks, and stale runtime directories
- Server single-instance protection to avoid multiple server processes running at the same time
- Existing stable fixes preserved:
  - Admin UI state loading
  - Client `client/...` runtime path handling
  - Media library sync reporting
  - Auto-hide while idle during playback
  - Offline installer packaging guidance

## Release assets

The GitHub release tagged `v1.0.1` is expected to contain exactly these two installer assets:

- `AdvertisingScreenServer-Setup-1.0.0.exe`
- `AdvertisingScreenClient-Setup-1.0.0.exe`

## Notes

- This repository intentionally excludes local-only files and artifacts such as `agentlogic.md`, `node_modules`, unpacked bundles, temp folders, and local environment files.
- Project-level operating rules and architecture guidance should be read from `PROJECT_GUIDE_AND_README/` before making changes.
