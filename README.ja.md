<!--
MANDATORY LOGIC GATE
Before making changes here, read PROJECT_GUIDE_AND_README/ files first.
-->

<div align="center">

# ScreenHub Display Management (v1.0.1)

**[English](./README.md) | [中文](./README.zh-CN.md) | [日本語](./README.ja.md)**

[![Release](https://img.shields.io/github/v/release/UIhoshi/screenhub-display-management?display_name=tag&style=flat-square)](https://github.com/UIhoshi/screenhub-display-management/releases/tag/v1.0.1)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D6?style=flat-square)](https://github.com/UIhoshi/screenhub-display-management)
[![Stack](https://img.shields.io/badge/stack-Electron%20%7C%20Node.js-3C873A?style=flat-square)](https://github.com/UIhoshi/screenhub-display-management)
[![Readme Languages](https://img.shields.io/badge/readme-en%20%7C%20zh%20%7C%20ja-b91c1c?style=flat-square)](https://github.com/UIhoshi/screenhub-display-management)
[![Deployment](https://img.shields.io/badge/deployment-LAN%20%2F%20Offline-orange?style=flat-square)](https://github.com/UIhoshi/screenhub-display-management)

</div>

**ScreenHub Display Management** は、LANベースでオフライン動作が可能な Electron ディスプレイ制御管理システムです。複数画面への遠隔プレイリスト配信、再生同期、端末監視、安定したオフライン展開をサポートします。

> [!WARNING]
> **Windows 環境におけるバージョン衝突の危険性 (v1.0.1 で修正済)**:
> 同一マシン上に複数のクライアント形態（例：ポータブル版Zipとインストール版Setup.exe）が混在すると、動作上の重大な競合を引き起こします。古いスタートアップ登録やタスクスケジューラが古いバイナリを起動してしまい、UIが反応しなくなったり、プレイリストが配信されなくなる障害の原因となります。単一のクライアントのみを実行するように整理してください。

---

## 🎯 製品定義

| 対象シナリオ | ScreenHub ソリューション |
| :--- | :--- |
| **オフライン・マルチスクリーン制御** | 外部インターネットを必要とせず、LAN環境に最適化された Electron サーバー＆クライアント構成。 |
| **複数バイナリ競合対策** | スタートアップ時のクリーニングモジュールが、ポータブル版/インストール版の重複プロセスと古い環境を削除。 |
| **複数サーバー多重起動防止** | サーバーの単一インスタンス保護により、重複起動によるデータベース同期不全や状態混乱を防御。 |
| **起動プロセスの自動復旧** | レジストリと Windows タスクスケジューラの自働クリーン機能で、正常な自動起動設定を再構成。 |

---

## 🚀 クイックスタート

### 方法 A: セットアップ版インストーラーの使用 (推奨)
1. [v1.0.1 リリースページ](https://github.com/UIhoshi/screenhub-display-management/releases/tag/v1.0.1) を開く。
2. 以下の2つのインストーラーファイルをダウンロード：
   * **サーバー用 (Server)**：`AdvertisingScreenServer-Setup-1.0.0.exe`
   * **クライアント用 (Client)**：`AdvertisingScreenClient-Setup-1.0.0.exe`
3. 管理側 PC にサーバーをインストールして起動し、管理管理画面を開きます。
4. 表示側大画面モニター PC にクライアントをインストールします。
5. LAN 経由で相互に通信可能な状態にし、ペアリングを完了させます。

### 方法 B: ソースコードからの実行
1. フォルダをクローンし、それぞれの配下で依存関係をインストール：
   ```bash
   # クライアント側
   cd client
   npm install

   # サーバー側
   cd ../server
   npm install
   ```
2. Electron を起動：
   ```bash
   npm run start
   ```

---

## 🧱 構造設計とドキュメントリンク

> [!NOTE]
> **ドキュメントセンター**: システムの定義や設計書、更新履歴は `PROJECT_GUIDE_AND_README/` に全て集約されています。修正前にこれらのドキュメントを参照してください。

### リポジトリ構成

| パス | 用途 |
| :--- | :--- |
| `client/` | プレーヤクライアントの Electron ソース、再生ウィンドウ処理及びパッケージ設定 |
| `server/` | 管理コントロールサーバーの Electron ソース、管理 Web 画面及びパッケージ設定 |
| `PROJECT_GUIDE_AND_README/` | 設計仕様書、システムマップ、里程碑履歴ログの保存ディレクトリ |

---

## ⚡ 安定化のコア機能 (v1.0.1)

* **競合インスタンスシールド**：同一の古いプロセスを自動で検出し、散包とインストール版の衝突を防御。
* **タスク自動クリーン**：古くなった自働起動レジストリや Windows タスクスケジューラ、一時ファイルを自動消去。
* **サーバー多重起動ロック**：同一マシンでの中控サーバー複数起動を物理的ポートロックにより阻止。
* **オフライン・保活処理**：外部接続が切れた状態でも、LAN内でハートビート通信を継続しプレイリスト同期を保護。

---

## ⚠️ 除外されるローカルファイル

リポジトリを軽量に保つため、以下のファイル群は Git 除外設定されています：
* 環境変数ファイル (`.env`)
* ビルド済みの `node_modules` 依存ライブラリ
* ビルド中間生成フォルダ及び一時パッケージング生成物
* 個人用ノートやデバッグログ (例: `agentlogic.md`)
