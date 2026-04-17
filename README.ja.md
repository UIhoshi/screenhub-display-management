<div align="center">

# ScreenHub Display Management

**LAN 環境での遠隔制御、オフライン配備、安定した運用を前提としたディスプレイ再生管理システム**

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

</div>

<div align="center">

[![Release](https://img.shields.io/github/v/release/UIhoshi/screenhub-display-management?display_name=tag&style=for-the-badge)](https://github.com/UIhoshi/screenhub-display-management/releases/tag/v1.0.1)
![Platform](https://img.shields.io/badge/platform-Windows-0078D6?style=for-the-badge)
![Stack](https://img.shields.io/badge/stack-Electron%20%7C%20Node.js-3C873A?style=for-the-badge)
![Deployment](https://img.shields.io/badge/deployment-LAN%20%2F%20Offline-orange?style=for-the-badge)
![Readme](https://img.shields.io/badge/readme-en%20%7C%20zh%20%7C%20ja-b91c1c?style=for-the-badge)

</div>

## 製品概要

ScreenHub は、Windows の LAN 環境向けに設計されたクライアント / サーバー型のディスプレイ再生管理システムです。

現在の公開ベースラインは `v1.0.1-stable` であり、機能追加よりも運用上の高頻度障害を減らすことに重点を置いています。

- 古いポータブル版とインストール版の競合で誤ったクライアントが起動する
- 古いスタートアップ設定やタスクが過去バージョンを再起動する
- サーバープロセスの重複起動で管理状態が混乱する

## ✨ 何を解決するのか？

- **古いインスタンスが残ると遠隔再生が不安定になる**: ScreenHub は競合クライアントや残留ランタイムの起動時整理を強化しています。
- **LAN 配備ではオフライン前提の安定性が必要**: このシステムはインターネット前提ではなくローカルネットワーク前提で設計されています。
- **重複サーバープロセスは誤動作の原因になる**: 単一インスタンス保護で管理状態の混乱を抑えます。
- **現場での切り分けコストが高い**: 配備文書と運用履歴を同じリポジトリ内の文書ハブにまとめています。

## クイックスタート

### release インストーラを使う

1. [`v1.0.1` release](https://github.com/UIhoshi/screenhub-display-management/releases/tag/v1.0.1) からサーバー版とクライアント版のインストーラを取得します。
2. 管理用マシンにサーバーをインストールします。
3. 表示用マシンにクライアントをインストールします。
4. サーバーを起動し、管理画面を開きます。
5. クライアントを起動し、接続またはペアリングを待ちます。

> 重要:
> 同じ Windows マシン上には有効なクライアント形態を 1 つだけ残してください。古いポータブル版とインストール版を同時に残さないでください。

### ソースコードを使う

1. `client/` と `server/` の両方で依存関係をインストールします。
2. 構造変更を行う前に `PROJECT_GUIDE_AND_README/` の文書を確認します。
3. まず unpacked 生成物で検証します。
4. パッケージング、インストール、アップグレード、正式納品の確認時のみ最終インストーラ検証へ進みます。

## 一目で分かる要約

<div align="center">

| 項目 | 内容 |
|------|------|
| リリース基線 | `v1.0.1-stable` |
| 実行形態 | Electron クライアント + Electron サーバー |
| 配備方式 | LAN / オフライン志向の Windows 配備 |
| 現在の重点 | 起動整理とインスタンス安定性 |
| 強化済みクライアント問題 | ポータブル版 / インストール版競合による誤起動 |
| 強化済みサーバー問題 | 重複プロセス / 重複状態の防止 |
| 文書ハブ | `PROJECT_GUIDE_AND_README/` |

</div>

## ✨ 主な機能

- LAN 環境でのクライアント再生管理
- Windows 向けのオフライン優先配備フロー
- ポータブル版とインストール版の競合を起動時に整理
- 古いスタートアップ項目、タスク、ランタイム残骸の整理
- サーバーの単一インスタンス保護

## ドキュメント入口

保守、障害対応、拡張開発の前に、次の文書を確認してください。

- [`PROJECT_GUIDE_AND_README/README_MASTER_CENTER.md`](./PROJECT_GUIDE_AND_README/README_MASTER_CENTER.md)
- [`PROJECT_GUIDE_AND_README/status/L1_SYSTEM_DEFINITION.md`](./PROJECT_GUIDE_AND_README/status/L1_SYSTEM_DEFINITION.md)
- [`PROJECT_GUIDE_AND_README/status/03_V1_0_0_STABLE_BASELINE.md`](./PROJECT_GUIDE_AND_README/status/03_V1_0_0_STABLE_BASELINE.md)
- [`PROJECT_GUIDE_AND_README/history/L2_MILESTONE_LOGS.md`](./PROJECT_GUIDE_AND_README/history/L2_MILESTONE_LOGS.md)

## 技術実装

**技術スタック**

- Electron クライアント
- Electron サーバー
- Node.js ローカルバックエンド
- Express、WebSocket などのローカル管理用依存

**アーキテクチャ上のポイント**

- `client/` と `server/` の分離構成
- Windows 向けインストーラ配布
- LAN 優先の配備モデル
- ランタイム整理とインスタンス制御を中心とした安定化

**リポジトリ構成**

| パス | 用途 |
|------|------|
| `client/` | Electron クライアントのソース、ビルド設定、パッケージング設定 |
| `server/` | Electron サーバーのソース、管理バックエンド、ビルド設定、パッケージング設定 |
| `PROJECT_GUIDE_AND_README/` | アーキテクチャ、配備、リファクタ履歴、運用文書 |
| `README.zh-CN.md` / `README.ja.md` | 多言語 README ページ |

## 開発

クライアントとサーバーは分けて管理します。

典型的なローカル作業フロー:

```bash
cd client
npm install

cd ../server
npm install
```

配備、インストール挙動、運用フローを変更する前に、必ず文書ハブを確認してください。

## Release 資産

[`v1.0.1`](https://github.com/UIhoshi/screenhub-display-management/releases/tag/v1.0.1) release には現在、次のインストーラが含まれています。

- `AdvertisingScreenServer-Setup-1.0.0.exe`
- `AdvertisingScreenClient-Setup-1.0.0.exe`

補足:

- release タグは `v1.0.1`
- インストーラのファイル名はまだ `1.0.0` 系を引き継いでいます

## 既知の制約

- 現在の README にはスクリーンショットや GIF デモ資産は含まれていません。
- 公開 README は配備対象に合わせて Windows 前提で記述されています。
- インストーラ命名はまだ `v1.0.1` のタグ体系に完全には追従していません。

## コントリビューション / サポート

- 配備不具合、起動整理の回帰、再生管理の問題があれば Issue を作成してください。
- PR を送る前に、文書ハブと運用文書を先に確認してください。

## License

このリポジトリには現在、個別のライセンスファイルはまだ含まれていません。
