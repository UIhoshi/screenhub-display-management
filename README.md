<div align="center">

# ScreenHub Display Management

**LAN-based display playback management for remote control, offline deployment, and stable client/server delivery**

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

</div>

<div align="center">

[![Release](https://img.shields.io/github/v/release/UIhoshi/screenhub-display-management?display_name=tag&style=for-the-badge)](https://github.com/UIhoshi/screenhub-display-management/releases/tag/v1.0.1)
![Platform](https://img.shields.io/badge/platform-Windows-0078D6?style=for-the-badge)
![Stack](https://img.shields.io/badge/stack-Electron%20%7C%20Node.js-3C873A?style=for-the-badge)
![Deployment](https://img.shields.io/badge/deployment-LAN%20%2F%20Offline-orange?style=for-the-badge)
![Readme](https://img.shields.io/badge/readme-en%20%7C%20zh%20%7C%20ja-b91c1c?style=for-the-badge)

</div>

## Product Proof

ScreenHub is a Windows-focused client/server system for managing remote display playback inside a LAN environment.

The current public baseline tracks `v1.0.1-stable`, with stability work concentrated on operational failure patterns that matter in real deployment:

- stale portable and installed client copies launching the wrong instance
- old auto-start entries and scheduled tasks relaunching outdated clients
- duplicate server processes causing management-state confusion

## ✨ What does this solve?

- **Remote display playback becomes unreliable when old instances linger**: ScreenHub hardens startup cleanup for conflicting client copies and old runtime leftovers.
- **LAN deployments need offline-first stability**: the system is designed for local network delivery instead of internet-first assumptions.
- **Duplicate server processes create confusing behavior**: single-instance protection reduces accidental management-state conflicts.
- **Field debugging is expensive**: the repository keeps its docs hub and deployment context close to the actual codebase.

## Quick Start

### Use the release installers

1. Download the server and client installers from the [`v1.0.1` release](https://github.com/UIhoshi/screenhub-display-management/releases/tag/v1.0.1).
2. Install the server on the management machine.
3. Install the client on the display machine.
4. Start the server and open the admin page.
5. Start the client and wait for pairing or connection.

> Important:
> Keep only one active client form on the same Windows machine. Do not leave an old portable copy and an installed copy side by side.

### Use the source code

1. Install dependencies in both `client/` and `server/`.
2. Read the project docs in `PROJECT_GUIDE_AND_README/` before making structural changes.
3. Validate unpacked artifacts first.
4. Move to final installer verification only when testing packaging or formal delivery.

## At a Glance

<div align="center">

| Topic | Summary |
|-------|---------|
| Release baseline | `v1.0.1-stable` |
| Runtime | Electron client + Electron server |
| Deployment | LAN / offline-oriented Windows delivery |
| Main hardening focus | startup cleanup and instance stability |
| Client-side risk addressed | portable/install conflicts launching the wrong instance |
| Server-side risk addressed | duplicate process / duplicate state protection |
| Docs hub | `PROJECT_GUIDE_AND_README/` |

</div>

## ✨ Core Features

- Client/server display management over a LAN environment.
- Offline-oriented deployment flow for Windows machines.
- Client startup cleanup for conflicting portable and installed runtime copies.
- Cleanup of stale startup entries, scheduled tasks, and legacy runtime folders.
- Server single-instance protection to avoid duplicate management-state confusion.

## Documentation Entry

Start here if you are maintaining or extending the project:

- [`PROJECT_GUIDE_AND_README/README_MASTER_CENTER.md`](./PROJECT_GUIDE_AND_README/README_MASTER_CENTER.md)
- [`PROJECT_GUIDE_AND_README/status/L1_SYSTEM_DEFINITION.md`](./PROJECT_GUIDE_AND_README/status/L1_SYSTEM_DEFINITION.md)
- [`PROJECT_GUIDE_AND_README/status/03_V1_0_0_STABLE_BASELINE.md`](./PROJECT_GUIDE_AND_README/status/03_V1_0_0_STABLE_BASELINE.md)
- [`PROJECT_GUIDE_AND_README/history/L2_MILESTONE_LOGS.md`](./PROJECT_GUIDE_AND_README/history/L2_MILESTONE_LOGS.md)

## Technical Implementation

**Tech stack**

- Electron client
- Electron server
- Node.js backend services
- Express, WebSocket, and related local management dependencies

**Architecture highlights**

- split `client/` and `server/` codebases
- installer-based Windows delivery for both roles
- LAN-focused deployment model
- stability-first hardening around runtime cleanup and instance control

**Repository layout**

| Path | Purpose |
|------|---------|
| `client/` | Electron display client source, build configuration, and packaging files |
| `server/` | Electron server source, admin backend, build configuration, and packaging files |
| `PROJECT_GUIDE_AND_README/` | architecture, deployment, refactoring, history, and operating docs |
| `README.zh-CN.md` / `README.ja.md` | multilingual README pages |

## Development

Client and server are maintained separately.

Typical local workflow:

```bash
cd client
npm install

cd ../server
npm install
```

Read the docs hub before changing packaging, installation behavior, or deployment flow.

## Release Assets

The GitHub release tagged [`v1.0.1`](https://github.com/UIhoshi/screenhub-display-management/releases/tag/v1.0.1) currently contains:

- `AdvertisingScreenServer-Setup-1.0.0.exe`
- `AdvertisingScreenClient-Setup-1.0.0.exe`

Notes:

- the release version is `v1.0.1`
- installer filenames currently remain on the `1.0.0` naming line in this baseline

## Version Evolution

- `v1.0.1`: hardened the public stable baseline around startup cleanup, wrong-instance prevention, and server-side duplicate-process protection.
- `v1.0.0`: established the original stable packaging line for the ScreenHub client/server delivery model.

## Known Limitations

- This repository currently does not expose preview screenshots or demo GIF assets in the README.
- The public README is Windows-first because the deployment target is Windows.
- Installer naming has not yet fully caught up with the `v1.0.1` release tag line.

## Contributing / Support

- Open an Issue for deployment bugs, startup cleanup regressions, or playback-management problems.
- Use PRs for targeted changes after reading the docs hub and project operating documents.

## License

No license file is currently declared in this repository.
