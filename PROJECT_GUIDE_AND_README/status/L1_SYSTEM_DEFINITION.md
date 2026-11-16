# L1_SYSTEM_DEFINITION (现状总览)

本文件描述项目此时此刻的真实状态。

---

## 📍 当前运行现实 (2026-04-11)

- 交付标准已经收敛为项目根目录 `windows/` 下仅保留两个最终安装包：
  - `AdvertisingScreenServer-Setup-1.0.0.exe`
  - `AdvertisingScreenClient-Setup-1.0.0.exe`
- 服务端安装版真实可写目录已经切换到 `AppData/Roaming/AdvertisingScreenServer/storage`，不再写入 `app.asar`。
- 客户端安装版真实运行目录围绕 `process.execPath` 展开：
  - `client/media-library`
  - `client/media-staging`
  - `client/control`
  - `logs`
- 当前验证结论：
  - 服务端双击后应直接进入管理后台。
  - 客户端双击后应直接进入测试页/匹配状态页。
  - 客户端接入后，设备页可出现 `connected: true`。
  - 播放链路已实测恢复，设备 `DESKTOP-1TKS164` 可开始播放视频。
  - 客户端最终素材目录以本机选择的 `media-library` 为准，并会同步回传服务端设备卡片。
  - 客户端播放中鼠标静止 `1.5s` 后自动隐藏，移动鼠标后恢复显示。
- 当前稳定回退基线已经固化为：
  - [03_V1_0_0_STABLE_BASELINE](./03_V1_0_0_STABLE_BASELINE.md)
  - [project-backups/backups/v1.0.0-stable](C:/Users/XU%20RONG/Documents/workspace/Advertising%20screen/project-backups/backups/v1.0.0-stable)
  - [project-backups/backups/v1.0.1-stable](C:/Users/XU%20RONG/Documents/workspace/Advertising%20screen/project-backups/backups/v1.0.1-stable)
- 当前对实例运行模型的新增确认：
  - 客户端同机不得并存旧散包、安装版和旧目录副本，否则可能导致 UI 失效、下发后不播放和错误实例被拉起。
  - 客户端当前稳定链路已加入启动时冲突清理：旧客户端进程、自启动、计划任务、旧运行目录。
  - 服务端当前稳定链路已加入单实例保护，避免重复服务端实例接管状态。
- 当前公开仓库交付入口已经建立：
  - `https://github.com/UIhoshi/screenhub-display-management`
  - release 标签：`v1.0.1`
  - release 资产：服务端与客户端两个安装包
  - 仓库首页 README 已改为中英日三语独立文件互链结构

## ⚠️ 当前重点风险

- **[UDP 广播拦截]**: 许多公司内网禁用了 UDP 广播 (255.255.255.255)，导致客户端无法通过“全自动”方式找到服务端。
- 管理后台“保存并下发”前端链路曾出现“页面无感知，但后端未真正保存”的问题
，后续每次打包必须再次回归。
- 远端共享推送目录与安装版客户端本地运行目录并非天然同一目录，客户端已增加 HTTP 回退逻辑，但仍需持续验证。
- 远端共享中的旧日志可能长期滞留，排障时必须优先看“当前正在运行实例”的日志，而不是共享目录里的历史遗留日志。
- 安装包文件名当前仍保留 `1.0.0` 命名线，而公开 release 标签已推进到 `v1.0.1`；后续若继续演进版本号，需要决定是否同步调整安装包命名策略。

## 🏗️ 端架构定义 (L2 导向)

### 1. [服务端架构现状](./L2_SERVER_ARCH.md)
- Express API 路由分布。
- WS 网关与心跳协议。
- 素材存储结构。

### 2. [客户端架构现状](./L2_CLIENT_ARCH.md)
- 主进程生命周期。
- 素材同步与缓存配额。
- 渲染层双舞台结构。
- 播放中鼠标自动隐藏与菜单唤醒逻辑。

---

## 📚 功能字典 (L3 导向)
- **[当前函数职责索引](./L3_FUNCTION_REGISTRY.md)**：记录目前正在使用的每一个函数的具体用途。
