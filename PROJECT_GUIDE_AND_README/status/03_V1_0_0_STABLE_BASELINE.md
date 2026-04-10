# V1.0.0 Stable Baseline

## 基线定义

- 版本标签：`v1.0.0-stable`
- 固定用途：作为当前可回退、可直接覆盖恢复的稳定版本
- 生成日期：`2026-04-09`

## 回退目录

- 当前稳定备份根目录：
  - [project-backups/backups/v1.0.0-stable](C:/Users/XU%20RONG/Documents/workspace/Advertising%20screen/project-backups/backups/v1.0.0-stable)
- 源码快照：
  - [project-backups/backups/v1.0.0-stable/source-snapshot](C:/Users/XU%20RONG/Documents/workspace/Advertising%20screen/project-backups/backups/v1.0.0-stable/source-snapshot)
- 散包快照：
  - [project-backups/backups/v1.0.0-stable/runtime-snapshot](C:/Users/XU%20RONG/Documents/workspace/Advertising%20screen/project-backups/backups/v1.0.0-stable/runtime-snapshot)

## 源码快照内容

- `client/src`
- `server/src`
- `client/build`
- `server/build`
- 根目录 `main.js`
- `client/package.json`
- `server/package.json`
- `.env.example`
- 关键 md 文档快照

## 散包快照内容

- `client-unpacked`
- `server-unpacked`
- `AdvertisingScreenClient-Setup-1.0.0.exe`
- `AdvertisingScreenServer-Setup-1.0.0.exe`
- 两个安装包均已重封装为带界面的 NSIS 安装器
- 安装界面已加入三语安装说明：`中文 / English / 日本語`
- 安装说明已明确约束：系统用于完全离线环境，仅保留软件故障排查相关的本地运行信息与日志，不会向任何个人、组织、平台或云服务上传或同步数据

## 当前稳定点

- 服务端 Admin UI 已修复 API 缓存导致的“等待状态加载”卡死问题
- 客户端共享推送路径与打包态运行目录已对齐到 `client/...`
- 客户端最终素材保存目录以客户端自己选择的 `media-library` 为准，并会同步回传服务端
- 客户端播放中鼠标静止 `1.5s` 自动隐藏，移动后恢复显示
- 客户端当前按钮交互/界面切换逻辑已视为稳定基线，不允许在未做专项回归前随意调整按钮位置、交换逻辑、显示条件或点击流
- 客户端当前语言切换逻辑已视为稳定基线，不允许在未做专项回归前重构语言菜单、语言状态同步或多语言资源加载链路
- 远端散包目录 `\\\\172.16.1.10\\screen\\client-unpacked` 已同步到当前稳定版 `app.asar`

## 回退方法

- 源码回退：直接用 `source-snapshot` 内对应目录覆盖当前源码
- 散包回退：直接用 `runtime-snapshot` 内对应目录覆盖 `windows/client-unpacked` 或 `windows/server-unpacked`
- 安装包回退：直接使用 `runtime-snapshot` 内保留的两个 `1.0.0` 安装包
- 目录约束：稳定备份不再放在 `windows/` 下，统一固定到 `project-backups/backups/v1.0.0-stable`
