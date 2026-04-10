# L2_SERVER_ARCH (服务端架构现状)

## 📡 通信层
- **WS 网关**: `ws-gateway.js`
  - 核心逻辑: REGISTER (认证), HEARTBEAT (状态), DOWNLOAD_STATUS (传输进度), LOCAL_ASSET_SNAPSHOT (客户端本地素材快照)。
- **UDP 发现**: `udp-discovery.js`
  - 逻辑: 自动识别内网 IP 段，向客户端返回正确的 SERVER_ACK。
- **HTTP 静态握手**: `POST /api/client/hello`
  - 逻辑: 当客户端已知服务端固定地址、但内网禁用 UDP 广播时，客户端可直接通过 HTTP 上报 `machineId/deviceName/platform`
  - 服务端会沿用原发现链创建或刷新 `discoveredDevices`，并返回 `approved/pairingCode/serverIp/httpPort/wsPort`
  - 这样首次静态接入也能拿到配对码，不再卡死在“必须先广播才能建档”

## 🧱 安装版运行模型
- **存储根目录**: 安装版统一使用 `app.getPath('userData')/storage`
- **管理后台**: 启动后应直接打开 `http://127.0.0.1:3000`
- **缓存策略**: 管理后台静态页面已强制 `no-store`，避免旧前端脚本被浏览器缓存。

## 📁 素材层
- **存储路径**: `storage/media/`
- **下发逻辑**: `pushPlaylistAssetsToDevice` 负责将素材推送到客户端共享目录。
- **删除语义**:
  - 文件删除已改成幂等行为
  - 前端删除成功后会主动重新同步当前目录，不依赖人工刷新
- **上传交互**:
  - 选择文件/文件夹后，上传区必须先显示已选素材列表
  - 列表为空时也保留“已选择 0 个素材”占位
- **客户端本地素材回传**:
  - 设备卡片新增“客户端本地素材”区块
  - 可查看客户端当前 `media-library` 的根目录、扫描时间、文件数、总大小和文件列表
  - 服务端可主动触发客户端重扫，也可按单文件向客户端下发删除指令

---
## 🔗 关联字典
- 参见 **[L3_FUNCTION_REGISTRY.md](./L3_FUNCTION_REGISTRY.md)** 了解具体实现函数。
