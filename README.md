<!--
MANDATORY LOGIC GATE
Before making changes here, read PROJECT_GUIDE_AND_README/ files first.
-->

# 🌌 ScreenHub Display Management (v1.0.1)

[![Release](https://img.shields.io/github/v/release/UIhoshi/screenhub-display-management?display_name=tag&style=flat-square)](https://github.com/UIhoshi/screenhub-display-management/releases/tag/v1.0.1)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D6?style=flat-square)](https://github.com/UIhoshi/screenhub-display-management)
[![Stack](https://img.shields.io/badge/stack-Electron%20%7C%20Node.js-3C873A?style=flat-square)](https://github.com/UIhoshi/screenhub-display-management)
[![Readme Languages](https://img.shields.io/badge/readme-en%20%7C%20zh%20%7C%20ja-b91c1c?style=flat-square)](https://github.com/UIhoshi/screenhub-display-management)
[![Deployment](https://img.shields.io/badge/deployment-LAN%20%2F%20Offline-orange?style=flat-square)](https://github.com/UIhoshi/screenhub-display-management)

**ScreenHub Display Management** is a LAN-based, offline-capable Electron display management system. It provides remote playlist scheduling, playback synchronization, client control, and stable deployment for distributed screen display installations.

**[English](./README.md) | [中文](./README.zh-CN.md) | [日本語](./README.ja.md)**

> [!WARNING]
> **Windows Field Conflict Hazard (Fixed in v1.0.1)**:
> Having multiple instances of the display client (e.g., both portable zip and setup exe files) on the same machine will trigger severe runtime conflicts. Stale auto-start registry items and task schedulers can launch the wrong binary, resulting in frozen UIs or playlist delivery failures. Keep only one client binary per machine.

---

## 🎯 Product Definition

| Target Scenario | ScreenHub Solution |
| :--- | :--- |
| **Distributed Offline Control** | Electron-based server and client setup designed to run over LAN environments without internet connections. |
| **Conflicting Binary Instances** | Startup cleanup module detects and wipes out conflicting portable/installed client processes and registry configs. |
| **Duplicate Server Processes** | Built-in single-instance server lock to prevent database synchronization corruption and control state conflicts. |
| **Durable Auto-Start Handling** | Self-cleaning registry rules that safely reset old auto-start pathways and Windows scheduled tasks. |

---

## 🚀 Quick Start

### Option A: Using the Setup Installers (Recommended)
1. Go to the [v1.0.1 Release Page](https://github.com/UIhoshi/screenhub-display-management/releases/tag/v1.0.1).
2. Download both setup assets:
   * **Server**: `AdvertisingScreenServer-Setup-1.0.0.exe`
   * **Client**: `AdvertisingScreenClient-Setup-1.0.0.exe`
3. Install the Server on the management computer and launch the admin backend.
4. Install the Client on the display monitor PC.
5. Connect both machines over the LAN and pair the client.

### Option B: Running from Source
1. Clone the repository and install dependencies in both subdirectories:
   ```bash
   # Configure Client
   cd client
   npm install

   # Configure Server
   cd ../server
   npm install
   ```
2. Run standard Electron startup scripts:
   ```bash
   npm run start
   ```

---

## 🧱 Architecture & Codebase Navigation

> [!NOTE]
> **Documentation Center**: The core operating specifications, milestones, and architectural blueprints are preserved in `PROJECT_GUIDE_AND_README/`. Review these documents before initiating modifications.

### Codebase Organization

| Directory / File | Core Purpose |
| :--- | :--- |
| `client/` | Electron player client source code, playback window logic, and build configs |
| `server/` | Electron central admin server, management portal backend, and build configs |
| `PROJECT_GUIDE_AND_README/` | Master documentation hub for architecture definitions and milestone logs |

### Key Documentation Entrypoints
* **Master Center**: [`PROJECT_GUIDE_AND_README/README_MASTER_CENTER.md`](./PROJECT_GUIDE_AND_README/README_MASTER_CENTER.md)
* **System Definitions**: [`PROJECT_GUIDE_AND_README/status/L1_SYSTEM_DEFINITION.md`](./PROJECT_GUIDE_AND_README/status/L1_SYSTEM_DEFINITION.md)
* **Baseline Status**: [`PROJECT_GUIDE_AND_README/status/03_V1_0_0_STABLE_BASELINE.md`](./PROJECT_GUIDE_AND_README/status/03_V1_0_0_STABLE_BASELINE.md)
* **Milestone Logs**: [`PROJECT_GUIDE_AND_README/history/L2_MILESTONE_LOGS.md`](./PROJECT_GUIDE_AND_README/history/L2_MILESTONE_LOGS.md)

---

## ⚡ Core Hardening Features (v1.0.1)

* **Wrong-Instance Shield**: Auto-detects legacy portable folders, installed executables, and cleans up process overlapping.
* **Registry & Task Reset**: Automatically deletes old, invalid auto-start registry entries and conflicting Windows Tasks.
* **Server Lock**: Prevents running multiple central servers on the same local port to keep state databases pure.
* **Offline Synchronization**: Hardened file-transmitting protocols to guarantee stable playback sync in disconnected networks.

---

## ⚠️ Repository Exclusion Scope

To maintain repository cleanliness, the following files are excluded via git configurations:
* Local environment files (`.env`)
* Compiled node dependencies (`node_modules/`)
* Temporary packaging folders and unpacked build byproducts
* Local sandbox diaries or private developer files (e.g. `agentlogic.md`)
