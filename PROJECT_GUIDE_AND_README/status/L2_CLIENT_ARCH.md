# L2_CLIENT_ARCH (客户端架构现状)

## 🧭 启动与运行模型
- **入口**: `client/src/main.js`
- **安装版路径模型**:
  - `media-library`: `path.dirname(process.execPath)/media-library`
  - `media-staging`: `path.dirname(process.execPath)/media-staging`
  - `control`: `path.dirname(process.execPath)/control`
  - `logs`: 优先安装目录旁，失败时回退 `app.getPath('userData')/logs`
- **服务器接入策略**:
  - 默认仍保留 UDP 广播发现
  - 若 `client-config.json` 中保存了手动服务器地址，客户端启动后会直接按该地址连接，不再持续发送 UDP 广播
  - 若部署时提供 `AD_SERVER_FIXED_IP` 或 `AD_SERVER_HOST`，客户端会把它当作固定服务器地址自动直连，支持 IP 或主机名，主机名解析交给系统当前网卡 / DNS 配置
- **本机网络识别**:
  - 客户端会自动从当前网卡中选取优先级最高的非回环 IPv4 作为 `localIp`
  - `localIp` 会显示在客户端状态栏，并随心跳一并上报，便于现场确认固定 IP 是否正确生效
- **窗口行为**:
  - 双击客户端图标后必须打开可见窗口。
  - 初始状态页应显示等待连接/匹配信息，而不是静默后台运行。

## 📦 素材接收与播放策略
- **优先路径**: 当服务端以 `pushedRelativePath` 下发素材时，客户端会优先尝试：
  - `media-library/<relative-path>`
  - `media-staging/<relative-path>`
- **回退策略**: 如果本地推送文件缺失或不完整，客户端会自动回退到 HTTP 下载缓存，不再因为单一共享路径缺失而整条播放失败。
- **文件夹素材**:
  - folder 项会优先使用服务端下发的 `entries` 明细作为内部播放源
  - 若没有 `entries`，仍可从 `media-staging` 同步到 `media-library` 后再扫描本地目录
  - 每个 folder 项都可以单独声明 `folderPlayMode`
- **本地素材快照**:
  - 客户端会递归扫描当前 `media-library`
  - 在首次 WS 认证成功、播放单应用完成、以及服务端主动要求重扫时上报 `LOCAL_ASSET_SNAPSHOT`
  - 服务端可据此看到客户端本地实际残留了哪些素材，并向客户端下发单文件删除指令

## 🖥️ 渲染层交互
- **渲染页**: `client/src/renderer/index.html`
- **双舞台模型**: 使用两层 `stage` 进行无闪烁切换。
- **状态浮层**:
  - 等待连接时保持可见
  - 播放时默认隐藏
  - 鼠标移动到右上角附近时显示菜单入口
- **鼠标行为**:
  - 播放内容激活后，鼠标静止约 1.5 秒自动隐藏
  - 任意鼠标移动立刻恢复显示
  - 打开菜单时强制显示鼠标
- **文件夹播放模型**:
  - 顶层播放列表与文件夹内部播放是两层独立状态机
  - 顶层 `random` 以“视频或文件夹”为单位按一轮去重随机推进
  - `folderPlayMode=sequence` 时，文件夹内部顺序播放一轮
  - `folderPlayMode=random` 时，文件夹内部打乱后完整播放一轮
  - 文件夹内视频仍按原始时长，文件夹设置时长仅作用于图片

## 🔍 当前验证重点
- 手动服务器地址、固定服务器地址、UDP 自动发现三条接入链路是否能按优先级切换
- 使用主机名时，客户现场的多 DNS 配置是否能由系统正常解析到目标服务器
- 客户端自动识别并显示的 `localIp` 是否与现场固定 IP 一致
- 保存并下发后的客户端是否立即收到新播放单
- SMB 推送失败时 HTTP 回退是否能稳定接管
- 鼠标自动隐藏是否只在“有实际播放内容”时触发
- 本地素材快照是否能在设备卡片实时显示，并在服务端触发删除后及时回传最新状态
