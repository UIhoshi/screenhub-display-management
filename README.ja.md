<h1 align="center">ScreenHub Display Management</h1>

<p align="center">
  画面再生、リモート制御、オフライン配備、安定したクライアント / サーバー運用のための LAN ベース Electron ディスプレイ管理システム。
</p>

[![Release](https://img.shields.io/github/v/release/UIhoshi/screenhub-display-management?display_name=tag&style=for-the-badge)](https://github.com/UIhoshi/screenhub-display-management/releases/tag/v1.0.1)
![Platform](https://img.shields.io/badge/platform-Windows-0078D6?style=for-the-badge)
![Stack](https://img.shields.io/badge/stack-Electron%20%7C%20Node.js-3C873A?style=for-the-badge)
![UI](https://img.shields.io/badge/readme-en%20%7C%20zh%20%7C%20ja-b91c1c?style=for-the-badge)
![Mode](https://img.shields.io/badge/deployment-LAN%20%2F%20Offline-orange?style=for-the-badge)

<p align="center">
  <a href="./README.md">English</a> |
  <a href="./README.zh-CN.md">中文</a> |
  <a href="./README.ja.md">日本語</a>
</p>

## 概要

ScreenHub Display Management は、Windows の LAN 環境向けに設計されたクライアント / サーバー型の画面再生管理システムです。

このリポジトリは `v1.0.1-stable` ベースラインを表しており、機能追加よりも運用安定性を重視しています。

- クライアント起動時にポータブル版とインストール版の競合を自動クリーンアップ
- 古い自動起動設定、タスクスケジューラ項目、旧ランタイムディレクトリの整理
- サーバーの単一起動保護による重複プロセスと管理状態混乱の防止

## `v1.0.1` が重要な理由

Windows 実機検証で、影響の大きい障害パターンが確認されました。

- 同じ PC に複数のクライアント形態を共存させてはいけない
- 古いポータブル版、旧インストール版、残留スタートアップ設定が誤ったクライアントを起動することがある
- その結果、次のような問題が発生する
  - UI がクリックできない
  - 配信が成功したように見えても再生が始まらない
  - 旧バージョンが動いているように見える

## 一覧

| 項目 | 概要 |
| --- | --- |
| 実行形態 | Electron クライアント + Electron サーバー |
| 配備方式 | LAN / オフライン志向の Windows 配備 |
| 現在の release 重点 | ランタイム整理とインスタンス安定化 |
| `v1.0.1` で強化したクライアント問題 | ポータブル版 / インストール版競合による誤起動 |
| `v1.0.1` で強化したサーバー問題 | 重複プロセス / 重複状態の防止 |
| ドキュメント中心 | `PROJECT_GUIDE_AND_README/` |

## リポジトリ構成

| パス | 用途 |
| --- | --- |
| `client/` | Electron クライアントのソース、ビルド設定、パッケージ設定 |
| `server/` | Electron サーバーのソース、管理バックエンド、ビルド設定、パッケージ設定 |
| `PROJECT_GUIDE_AND_README/` | アーキテクチャ、配備、リファクタリング履歴、運用ドキュメント |

## ドキュメントの入口

保守や拡張を行う場合は、まず以下を読んでください。

- [`PROJECT_GUIDE_AND_README/README_MASTER_CENTER.md`](./PROJECT_GUIDE_AND_README/README_MASTER_CENTER.md)
- [`PROJECT_GUIDE_AND_README/status/L1_SYSTEM_DEFINITION.md`](./PROJECT_GUIDE_AND_README/status/L1_SYSTEM_DEFINITION.md)
- [`PROJECT_GUIDE_AND_README/status/03_V1_0_0_STABLE_BASELINE.md`](./PROJECT_GUIDE_AND_README/status/03_V1_0_0_STABLE_BASELINE.md)
- [`PROJECT_GUIDE_AND_README/history/L2_MILESTONE_LOGS.md`](./PROJECT_GUIDE_AND_README/history/L2_MILESTONE_LOGS.md)

## クイックスタート

### リリース版インストーラーを使う

1. [`v1.0.1` release](https://github.com/UIhoshi/screenhub-display-management/releases/tag/v1.0.1) から 2 つのインストーラーを取得します。
2. 管理用マシンにサーバーをインストールします。
3. 表示用マシンにクライアントをインストールします。
4. サーバーを起動し、管理ページを開きます。
5. クライアントを起動して、ペアリングまたは接続を待ちます。

注意:

- 同じ Windows マシンには 1 つのクライアント形態だけを残してください
- 古いポータブル版とインストール版を同時に残さないでください
- 新しい動作を検証するときは、古い unpacked コピーが起動されていないことを確認してください

### ソースコードを使う

1. `client/` と `server/` の両方で依存関係をインストールします。
2. 変更前に `PROJECT_GUIDE_AND_README/` のプロジェクト文書を確認します。
3. まず unpacked 生成物で検証します。
4. パッケージ、インストール、アップグレード、正式納品を検証するときだけ最終インストーラー検証に進みます。

## Release 資産

[`v1.0.1`](https://github.com/UIhoshi/screenhub-display-management/releases/tag/v1.0.1) release には現在、次の 2 つのインストーラーが含まれます。

- `AdvertisingScreenServer-Setup-1.0.0.exe`
- `AdvertisingScreenClient-Setup-1.0.0.exe`

補足:

- release のバージョンは `v1.0.1`
- このベースラインではインストーラーのファイル名は引き続き `1.0.0` のままです

## このリポジトリに含めないローカル専用ファイル

このリポジトリには次のものを含めません。

- ローカル `.env`
- `node_modules`
- unpacked テスト生成物
- 一時パッケージ成果物
- `agentlogic.md` のようなローカル私用メモ
