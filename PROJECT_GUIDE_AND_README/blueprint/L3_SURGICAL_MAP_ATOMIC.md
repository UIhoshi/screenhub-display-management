# L3_SURGICAL_MAP_ATOMIC (原子级手术地图 - 严禁自由发挥版)

## 🎨 UI 统一化指令 (UI Mirroring Command)

### 【最高准则】
**分发配置抽屉（Playlist Items）的 UI 必须像素级复刻“素材库列表模式”的逻辑。** 禁止为抽屉单独编写复杂的嵌套 HTML。

---

## 🔬 Admin UI 函数 (Frontend Atomic)

### 交互稳定性补充 (Interaction Stability)
- **`applyConfigToTargets()`**: 
  - 必须引入 `loading` 状态。
  - 下发时按钮禁用，文字变为 `下发中...`，成功后变为 `下发成功` 并延时复原。
- **`setEditorState(payload)`**: 
  - **严禁**在列表为空时强行填充 `catalog[0]`，保持空列表状态。
- **`renderPlaylistItems(items)`**: 
  - 为每一项增加唯一的 `data-id` 或 `data-index`，确保点击修改时目标明确。
  - 增加 `last-added` 动效或高亮样式。

### `renderPlaylistItems(items)`
- **重构要求**: 彻底废除 Codex 目前的臃肿实现。
- **UI 结构镜像**: 强制使用与素材库列表模式一致的 `.asset-list-row` 结构。
- **HTML 模板骨架**:
  ```html
  <article class="asset asset-list-row">
    <div class="playlist-thumb-container">[图标]</div>
    <div class="asset-list-body">
      <strong class="asset-title">${fileName}</strong>
      <div class="meta">类型: ${type} | 路径: ${path}</div>
    </div>
    <div class="asset-actions">
      [时长输入框(仅限图片)]
      <button onclick="move(-1)">上移</button>
      <button onclick="move(1)">下移</button>
      <button class="danger" onclick="remove()">删除</button>
    </div>
  </article>
  ```
- **核心逻辑**: 
  1. 文件夹项：显示文件夹图标，不显示时长输入。
  2. 视频项：显示视频图标，不显示时长输入。
  3. 图片项：显示图片图标，显示 5s 输入框。

### `renderAssets(listing)`
- **重构要求**: 补齐“一键加入”按钮。
- **文件夹按钮**: `<button onclick="addFolderToPlaylist('${dir.path}')">加入下发列表</button>`。
- **文件按钮**: `<button onclick="addFileToPlaylist('${file.path}')">加入下发列表</button>`。

---

## 🔬 服务端与客户端逻辑

### `normalizePlaylistDocument(payload)`
- **重构要求**: 保持原子性。
- **逻辑**: 如果前端传的是 `type: 'folder'`，后端**严禁**查询数据库或文件系统进行展开，原样存入并原样下发。

### `playCurrent()` (Client)
- **重构要求**: 实现文件夹自治播放。
- **逻辑**: 遇到 `type: 'folder'`，客户端自动遍历本地目录并开启子循环。
