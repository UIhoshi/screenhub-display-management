<h1 align="center">ScreenHub Display Management</h1>

<p align="center">
  LAN-based Electron display management system for screen playback, remote control, offline deployment, and stable client/server delivery.
</p>

<p align="center">
  <a href="https://github.com/UIhoshi/screenhub-display-management/releases/tag/v1.0.1"><img src="https://img.shields.io/github/v/release/UIhoshi/screenhub-display-management?display_name=tag&style=for-the-badge" alt="Release"></a>
  <img src="https://img.shields.io/badge/platform-Windows-0078D6?style=for-the-badge" alt="Platform">
  <img src="https://img.shields.io/badge/stack-Electron%20%7C%20Node.js-3C873A?style=for-the-badge" alt="Stack">
  <img src="https://img.shields.io/badge/readme-en%20%7C%20zh%20%7C%20ja-b91c1c?style=for-the-badge" alt="Readme Languages">
  <img src="https://img.shields.io/badge/deployment-LAN%20%2F%20Offline-orange?style=for-the-badge" alt="Deployment">
</p>

<p align="center">
  <a href="./README.md">English</a> |
  <a href="./README.zh-CN.md">中文</a> |
  <a href="./README.ja.md">日本語</a>
</p>

## Overview

ScreenHub Display Management is a Windows-focused client/server system for managing remote display playback over a LAN environment.

This repository tracks the `v1.0.1-stable` baseline and focuses on operational stability:

- client startup cleanup for conflicting portable and installed instances
- cleanup of stale auto-start entries, scheduled tasks, and legacy runtime folders
- server single-instance protection to avoid duplicate processes and management-state confusion

## Why v1.0.1 matters

Windows field testing confirmed a high-impact failure pattern:

- the same machine must not keep multiple client forms at the same time
- old portable copies, installed copies, or stale startup entries can launch the wrong client
- the result can appear as:
  - unclickable UI
  - playlist delivery appearing successful but playback not starting
  - behavior that looks like the machine is still running an older version

## At a glance

| Topic | Summary |
| --- | --- |
| Runtime | Electron client + Electron server |
| Deployment | LAN / offline-oriented Windows delivery |
| Release focus | Runtime cleanup and instance stability |
| Client issue hardened in `v1.0.1` | Wrong-instance launch caused by portable/install conflicts |
| Server issue hardened in `v1.0.1` | Duplicate process / duplicate state protection |
| Docs hub | `PROJECT_GUIDE_AND_README/` |

## Repository layout

| Path | Purpose |
| --- | --- |
| `client/` | Electron display client source, build configuration, and packaging files |
| `server/` | Electron server source, admin backend, build configuration, and packaging files |
| `PROJECT_GUIDE_AND_README/` | Architecture, deployment, refactoring, history, and project-level operating documents |

## Documentation entry

Start here if you are maintaining or extending the project:

- [`PROJECT_GUIDE_AND_README/README_MASTER_CENTER.md`](./PROJECT_GUIDE_AND_README/README_MASTER_CENTER.md)
- [`PROJECT_GUIDE_AND_README/status/L1_SYSTEM_DEFINITION.md`](./PROJECT_GUIDE_AND_README/status/L1_SYSTEM_DEFINITION.md)
- [`PROJECT_GUIDE_AND_README/status/03_V1_0_0_STABLE_BASELINE.md`](./PROJECT_GUIDE_AND_README/status/03_V1_0_0_STABLE_BASELINE.md)
- [`PROJECT_GUIDE_AND_README/history/L2_MILESTONE_LOGS.md`](./PROJECT_GUIDE_AND_README/history/L2_MILESTONE_LOGS.md)

## Quick start

### Use the release installers

1. Download the two installer assets from the [`v1.0.1` release](https://github.com/UIhoshi/screenhub-display-management/releases/tag/v1.0.1).
2. Install the server on the management machine.
3. Install the client on the display machine.
4. Start the server and open the admin page.
5. Start the client and wait for pairing or connection.

Important:

- keep only one client form on the same Windows machine
- do not keep an old portable client and an installed client at the same time
- if you are validating new behavior, make sure an older unpacked copy is not being launched

### Use the source code

1. Install dependencies in both `client/` and `server/`.
2. Read the project docs in `PROJECT_GUIDE_AND_README/` before making changes.
3. Validate unpacked artifacts first.
4. Move to final installer verification only when testing packaging, installation behavior, upgrade flow, or formal delivery.

## Release assets

The GitHub release tagged [`v1.0.1`](https://github.com/UIhoshi/screenhub-display-management/releases/tag/v1.0.1) contains:

- `AdvertisingScreenServer-Setup-1.0.0.exe`
- `AdvertisingScreenClient-Setup-1.0.0.exe`

Note:

- the release version is `v1.0.1`
- the installer filenames currently remain on the `1.0.0` naming line in this baseline

## Local-only files excluded from this repository

This repository intentionally does not include:

- local environment files such as `.env`
- `node_modules`
- unpacked test bundles
- temp folders and local packaging artifacts
- local private notes such as `agentlogic.md`
