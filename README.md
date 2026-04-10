# ScreenHub Display Management

> LAN-based Electron display management system for screen playback, remote control, offline deployment, and stable client/server delivery.

![Release](https://img.shields.io/github/v/release/UIhoshi/screenhub-display-management?display_name=tag)
![Platform](https://img.shields.io/badge/platform-Windows-0078D6)
![Stack](https://img.shields.io/badge/stack-Electron%20%7C%20Node.js-3C873A)
![Mode](https://img.shields.io/badge/deployment-LAN%20%2F%20Offline-orange)

## Overview

ScreenHub Display Management is a Windows-focused client/server system for managing remote display playback over a LAN environment.

It is designed for scenarios where you need:

- a local server for device management and playlist delivery
- a display client for remote playback and on-screen control
- offline-friendly deployment inside internal networks
- predictable Windows packaging and installer delivery

This repository tracks the `v1.0.1-stable` baseline.

## What v1.0.1 Stabilizes

`v1.0.1` focuses on operational stability rather than feature expansion.

The most important hardening in this release:

- client startup cleanup for conflicting portable/install-based instances
- cleanup of stale auto-start entries, scheduled tasks, and legacy runtime folders
- server single-instance protection to avoid duplicate server processes and state confusion
- preservation of the stable playback, admin UI, and offline packaging baseline

## Why This Release Matters

During Windows field testing, one of the highest-impact failure patterns was confirmed:

- the same machine must not keep multiple client forms at the same time
- portable builds, installed builds, old copies, or stale startup entries can pull up the wrong instance
- that conflict can surface as:
  - UI becoming unclickable
  - playlist delivery appearing successful but playback not starting
  - the machine behaving like it is still running an older version

`v1.0.1` turns that lesson into code-level startup cleanup and stricter runtime guarding.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `client/` | Electron display client source, build configuration, and packaging files |
| `server/` | Electron server source, admin backend, build configuration, and packaging files |
| `PROJECT_GUIDE_AND_README/` | Architecture, deployment, refactoring, history, and project-level operating documents |

## Documentation Entry

If you are reading this repository for implementation or maintenance work, start here:

- [`PROJECT_GUIDE_AND_README/README_MASTER_CENTER.md`](./PROJECT_GUIDE_AND_README/README_MASTER_CENTER.md)
- [`PROJECT_GUIDE_AND_README/status/L1_SYSTEM_DEFINITION.md`](./PROJECT_GUIDE_AND_README/status/L1_SYSTEM_DEFINITION.md)
- [`PROJECT_GUIDE_AND_README/status/03_V1_0_0_STABLE_BASELINE.md`](./PROJECT_GUIDE_AND_README/status/03_V1_0_0_STABLE_BASELINE.md)
- [`PROJECT_GUIDE_AND_README/history/L2_MILESTONE_LOGS.md`](./PROJECT_GUIDE_AND_README/history/L2_MILESTONE_LOGS.md)

## Quick Start

### Use the release installers

If your goal is testing or deployment on Windows machines:

1. Download the two installer assets from the [`v1.0.1` release](https://github.com/UIhoshi/screenhub-display-management/releases/tag/v1.0.1).
2. Install the server on the management machine.
3. Install the client on the display machine.
4. Start the server and open the admin page.
5. Start the client and wait for pairing / connection.

Important:

- keep only one client form on the same Windows machine
- do not keep an old portable client and an installed client at the same time
- if you are validating new behavior, make sure you are not launching an older unpacked copy by mistake

### Use the source code

If your goal is development or verification from source:

1. Install dependencies in both `client/` and `server/`.
2. Review the project docs in `PROJECT_GUIDE_AND_README/` before making changes.
3. Build and validate unpacked artifacts first.
4. Move to final installer verification only when you are testing packaging, install behavior, upgrade flow, or formal delivery.

### Main directories

- `client/`: display client source and packaging config
- `server/`: management server source and packaging config
- `PROJECT_GUIDE_AND_README/`: architecture, deployment, history, and operating documentation

## Delivery Model

This project follows a two-track verification model:

- unpacked runtime validation first
- final installer validation second

In practice, that means:

- functional debugging should usually happen in unpacked builds first
- installer testing should focus on install paths, startup entries, scheduled tasks, packaging leftovers, and release behavior

## Release Assets

The GitHub release tagged [`v1.0.1`](https://github.com/UIhoshi/screenhub-display-management/releases/tag/v1.0.1) is expected to contain exactly these two installer assets:

- `AdvertisingScreenServer-Setup-1.0.0.exe`
- `AdvertisingScreenClient-Setup-1.0.0.exe`

Note:

- the release version is `v1.0.1`
- the installer filenames currently remain on the `1.0.0` naming line in this baseline

## Local-Only Files Excluded From This Repository

This repository intentionally does not include:

- local environment files such as `.env`
- `node_modules`
- unpacked test bundles
- temp folders and local packaging artifacts
- local private notes such as `agentlogic.md`

## Current Position

This repository is not trying to be a generic signage template.

It is a practical Windows LAN display management baseline with:

- a documented architecture
- a documented release path
- a documented failure history
- and a stabilized `v1.0.1` source line suitable for continued iteration
