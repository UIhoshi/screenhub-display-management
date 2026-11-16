# AgentLogic V5

本文件是通用型 AI 工程协作协议，用于在开始项目、复核项目、修复项目、重构项目、打包项目和发布项目时，统一 AI 的工作方式、文档纪律与交付边界。

---

## 1. 核心目标

- 降低大项目中的上下文混乱、角色错位和文档失真。
- 保证 AI 在修改代码前先掌握架构、历史、边界和发布规则。
- 保证所有修复、重构、打包和发布动作都能形成可回溯闭环。

---

## 2. 三层分层模型

### L1：战略与入口层

- 职责：定义项目当前所处状态与主入口。
- 关注内容：Status、Blueprint、History、项目主 README、交付规则、发布规则。
- 使用目的：先判断任务属于“理解现状”“规划重构”还是“执行修改”。

### L2：领域架构层

- 职责：定义模块边界、设计原则、交互约束、性能方向、部署约束。
- 关注内容：模块结构、通信链路、路径模型、状态机、设计模式、运行模型。
- 使用目的：确保改动符合系统级工程逻辑，而不是只在局部“修好”。

### L3：原子执行层

- 职责：落实到文件、函数、入口、命令、构建参数和验证动作。
- 关注内容：具体文件、函数职责、构建命令、日志落点、验证方法、修复物理位置。
- 使用目的：消除修改歧义，确保可执行、可验证、可回写文档。

---

## 3. 项目接入前强制规则

### 3.1 项目文档先读后动

- 每次开始一个项目、复核一个项目，或修复一个项目之前，必须先阅读该项目全部 `.md` 文档，再进入分析、修改、打包或发布阶段。
- 读文档的目的不是形式化流程，而是先掌握：
  - 项目架构定义
  - 目录边界
  - 历史演进
  - 部署规则
  - 发布约束
  - 既有排障经验
- 未完成文档阅读前，不应直接对架构、部署方式、打包目录、运行模型、账号规则、稳定基线做假设。

### 3.2 项目文档主入口优先级

- 若项目存在统一文档中心，必须优先从文档中心进入，而不是零散扫描单个说明文件。
- 若项目存在“README 总控页 / 文档导航页 / 项目指挥中心”，应视为第一入口。

### 3.3 角色边界先明确

- 接入项目后，应先明确当前任务是：
  - L1：理解、梳理、规划
  - L2：方案、架构、交互、边界
  - L3：代码修改、构建、验证、发布
- 未确认任务边界前，不应擅自扩大范围或额外追加功能。

---

## 4. 同步与闭环协议

### 4.1 先读后写

- 修改代码前，必须先读取相关文档与相关代码。
- 不允许只看报错现象就直接下手改。

### 4.2 成功即同步

- 只要代码已成功修改、验证、确认，就必须同步更新相关 md。
- 不允许把关键经验只留在会话里。

### 4.3 文档必须记录的最小集合

- 触发现象
- 影响范围
- 根因判断
- 修改文件
- 修改方式
- 验证方式
- 若涉及构建，还应补：
  - build 命令
  - 构建参数
  - 产物时间戳
  - 安装目录或运行目录验证结果

### 4.4 结构落盘

- 凡是已经读过、改过、验证过的关键结构，都必须尽量落到 md：
  - 入口文件
  - 模块关系
  - 关键函数职责
  - 路径模型
  - 数据流
  - 通信流
  - 依赖流

### 4.5 故障索引化

- 每次 build 后出现的故障、回归、预期风险和修复动作，都要写入 md。
- 文档目标不是“总结”，而是形成可检索的故障索引。

---

## 5. 工程执行规则

### 5.1 计划先行

- 任务超过 3 步、涉及多模块、涉及重构、涉及部署或发布时，必须先形成清晰执行顺序。

### 5.2 验证先于完成

- 未验证有效，不得标记为完成。
- 验证可以是：
  - 语法检查
  - 构建成功
  - 运行成功
  - 路径验证
  - 日志验证
  - 实机验证

### 5.3 优雅优先

- 不接受只为临时通过的补丁式修复。
- 应优先选择结构清晰、边界稳定、后续可维护的方案。

### 5.4 自主排障

- 对明确可定位的问题，应主动沿日志、路径、实例状态、构建链路继续排查。
- 不应把显然能继续查清的问题过早甩回给用户。

### 5.5 禁止擅自追加功能

- 未经用户明确确认，不得擅自添加需求外功能、交互、状态机变化、默认行为变化、视觉改造、流程改造或“顺手优化”。
- 如果有更好的方案，可以提出，但必须先等用户确认。

---

## 6. 文档精度强制条款

### 6.1 文档不是附属品

- md 不是“说明书附件”，而是项目运行地图、排障索引和修复档案。

### 6.2 精度优先

- 只要时间允许，文档应更具体，而不是更抽象。

### 6.3 物理定位强制

- 文档中只要出现函数名、方法名、命令名、事件名，默认就应给出文件路径。
- 最优形式是：
  - `函数名` + `文件路径`
  - 如条件允许，再补近似行号或搜索锚点

### 6.4 关联链要求

- 关键函数不应只写单点职责，还应补：
  - 谁调用它
  - 它影响谁
  - 对应哪份文档或哪段链路

### 6.5 日志落点必须明确

- 日志写入哪里，属于架构事实，不是实现细节。
- 任何新增或修改日志逻辑时，必须同步检查日志物理落点是否仍符合项目规则。
- 如因权限问题需要退路，必须显式记录，不得静默改到别处。

---

## 7. 打包与运行分层协议

### 7.1 默认双轨

- 轨道 A：散装测试产物
  - 如 `win-unpacked`、可执行目录、debug build、未安装包
- 轨道 B：最终安装包或发布包
  - 如 `.exe`、NSIS、MSI、`.dmg`、`.AppImage`、APK、AAB 等

### 7.2 默认顺序

- 先在轨道 A 验证功能逻辑、交互、状态机、通信链路。
- 只有在以下情况才切到轨道 B：
  - 用户明确要求最终安装包
  - 进入提测、验收、交付阶段
  - 问题只会出现在安装、签名、打包、权限、升级、卸载链路

### 7.3 打包前必须确认

- 当前目标是测试散包，还是最终交付安装包？
- 当前目标是功能验证，还是正式发布？
- 若用户未明确要求最终安装包，则默认停留在散装验证阶段。

### 7.4 打包后高风险检查项

- 安装目录
- 工作目录
- `app.asar`
- 配置文件读取
- 缓存是否命中旧版本
- 自启动
- 计划任务
- 残留进程
- 卸载信息
- 权限、签名、文件锁
- 共享目录或用户目录路径模型

### 7.5 Release 资产完整性规则

- 当项目进入 GitHub release、正式发布、稳定版归档或里程碑版本交付阶段时，release 不应只上传安装包或可执行产物。
- release 默认还必须同步上传“本次发布版本对应的源码包”。
- 这里的“源码包”指与本次 tag / release 对应的版本源码归档，而不是随手打包的当前工作目录快照。
- 若项目同时提供：
  - 安装包
  - 可执行散包
  - 源码包
  则应优先保证源码包也进入同一 release，形成完整的版本闭环。
- 这样做的目的包括：
  - 便于后续回退
  - 便于版本审计
  - 便于离线归档
  - 便于在 release 页面直接取得与安装包严格对应的源码版本
- 若只是日常小修小补且未进入正式 release，则不强制手工附加源码包；但一旦进入“发布版本”动作，源码包应视为标准资产。

---

## 8. 实例冲突与清理规则

### 8.1 客户端实例冲突清理规则

- 同一台机器若同时存在多个客户端运行形态，例如：
  - 散包版
  - 安装版
  - 旧目录副本
  - 残留安装状态
- 则可能导致：
  - UI 无法点击
  - 保存并下发后不播放
  - 错误实例被拉起
  - 行为看起来像“代码没更新”
- 因此客户端启动链路必须默认具备冲突清理能力。

### 8.2 客户端最低清理范围

- 旧 `AdvertisingScreenClient.exe` 进程
- 自启动注册表项
- 计划任务
- 旧安装目录
- 旧散包目录
- 旧运行时目录
- 与当前实例冲突的控制目录和本地运行目录

### 8.3 服务端多实例防护规则

- 服务端必须具备单实例约束。
- 默认策略应为：
  - 阻止第二实例
  - 唤醒或打开现有实例
- 服务端不得因为多实例防护而默认清空用户业务数据。

### 8.4 冲突清理边界规则

- 清理实例冲突，不等于清空用户配置。
- 可以自动清理的对象：
  - 冲突进程
  - 自启动项
  - 计划任务
  - 旧运行目录
  - 旧散包目录
  - 与当前实例冲突的安装目录
- 默认不得自动清理的对象：
  - 用户配置文件
  - 服务端存储数据
  - 播放单
  - 审批记录
  - 素材库
  - 安装包仓库
- 只有用户明确要求“重置配置 / 恢复出厂 / 清空数据”时，才允许删除配置和业务数据。

---

## 9. UI / UX 与 README 表现规则

### 9.1 UI / UX 改动边界

- UI 改动不能只追求“看起来更现代”，必须符合项目实际交互与产品边界。
- 任何状态机、布局结构、用户操作路径的变化，都应被视为产品改动，而不是纯视觉改动。

### 9.2 README 作为项目首页

- GitHub README 不只是文档，也应被视为项目公开首页和第一层产品印象。
- 当任务涉及 README、仓库首页、release 页、项目介绍页时，不能只补信息密度，还应评估：
  - 首屏节奏
  - 分区层次
  - 视觉冲击力
  - 记忆点
- 允许主动优化：
  - Hero 标题与副标题
  - badges
  - feature matrix
  - 版本演进时间线
  - 双语或多语入口
  - 更清晰的 landing narrative
- 前提是不改变事实，不擅自虚构能力。
- README 必须默认包含“使用说明 / Usage / Quick Start”一类入口内容。
- 即使项目仍在迭代、功能仍不完整，README 也不应只有介绍和架构说明；至少要告诉读者：
  - 这个仓库如何开始使用
  - 主要目录分别做什么
  - 客户端和服务端如何启动或验证
  - 安装包或 release 资产应从哪里获取
- 如果项目当前更适合“开发者使用说明”而不是“终端用户使用说明”，也必须明确写出最小可执行步骤，而不是省略使用部分。
- 当 README 需要多语种时，默认不要把中英日等完整内容堆叠在同一个页面中。
- 多语 README 的推荐结构是：
  - `README.md` 作为默认主入口页
  - `README.zh-CN.md` 作为中文页
  - `README.ja.md` 作为日文页
  - 若有其他语言，再按同样方式扩展独立文件
- 每个语言页的顶部都必须提供统一的跨语言超链接，例如：
  - `English | 中文 | 日本語`
- 默认主 README 应保留：
  - 标题
  - 简介
  - badges
  - 多语入口超链接
  - 当前语言版本的完整内容
- 目标是既保证多语支持，也保证首页清晰，不要让一个 README 因三语全文堆叠而失去首页节奏与可读性。
- 当 README 被作为仓库首页处理时，允许优先采用居中排版来增强视觉统一感，尤其适用于：
  - 主标题
  - 副标题 / slogan
  - badges
  - 多语种切换超链接
- 这类居中排版的目标不是装饰，而是让仓库首页更像产品入口页而不是普通文本页。
- 若采用居中排版，应尽量让顶部结构保持一致：
  - 居中标题
  - 居中副标题
  - 居中 badges
  - 居中语言切换入口
- 只要不影响可读性与事实表达，这种顶部 Hero 区的视觉整理应被视为推荐做法，而不是额外装饰。

---

## 10. 安全与验证协议

### 10.1 敏感操作要有回滚点

- 删除、移动、覆盖、发布、替换、清理等敏感动作，必须保留可恢复路径或明确回滚点。

### 10.2 深度验证

- 验证不能只停留在“能打开”。
- 应覆盖：
  - 空数据
  - 非法输入
  - 网络中断
  - 空间不足
  - 路径错位
  - 安装残留
  - 旧缓存命中

### 10.3 交付要附带可证明信息

- 交付时应尽量提供：
  - 验证方式
  - 关键结果
  - 未验证部分
  - 剩余风险

---

## 11. 自我进化循环

- 用户一旦纠正，就应尽快把经验沉淀进正确文档。
- 新会话开始时，应优先复核历史教训和项目文档。
- 当代码与 md 的信息密度不对称时，默认补全文档，而不是减少文档。

---

## 12. 禁止事项

- 不得在未读完项目 md 前，擅自定义项目架构。
- 不得在未确认当前任务边界前，擅自扩散修改范围。
- 不得把项目级规则写进错误目录。
- 不得把本地私有规则、临时笔记或无关副产物误上传到仓库。
- 不得把项目 A 的仓库专属规则机械复制到项目 B。

---

## 13. 推荐执行顺序

1. 先读项目全部 md。
2. 确认项目文档主入口与当前任务层级。
3. 读取相关代码与相关运行目录。
4. 形成执行顺序与风险判断。
5. 修改代码或整理发布物。
6. 执行验证。
7. 同步更新正确位置的 md。
8. 最后再交付结论、路径、风险与下一步建议。

---

## 14. 版本说明

- 本版为 `AgentLogic_V5`
- 本版是对 `agentlogic.md` 与 `agentlogic test1.md` 的整理版：
  - 保留通用工程规则
  - 保留打包 / 文档 / 冲突清理 / README 表现规则
  - 删除与当前项目无关的其他仓库专属附录

---

# AgentLogic V5 (English Version)

This document is a general AI engineering collaboration protocol. It standardizes how AI should work when starting a project, reviewing a project, fixing a project, refactoring a project, packaging a project, or publishing a project.

---

## 1. Core Goals

- Reduce context confusion, role drift, and documentation distortion in large projects.
- Ensure that AI understands architecture, history, boundaries, and release rules before modifying code.
- Ensure that every fix, refactor, packaging action, and release action forms a traceable closed loop.

---

## 2. Three-Layer Model

### L1: Strategic Entry Layer

- Responsibility: define the current state of the project and its main entry context.
- Focus: Status, Blueprint, History, project README, delivery rules, and release rules.
- Purpose: determine whether the task is about understanding, planning, or execution.

### L2: Architectural Domain Layer

- Responsibility: define module boundaries, design principles, interaction constraints, performance direction, and deployment constraints.
- Focus: module structure, transport flows, path models, state machines, design patterns, and runtime models.
- Purpose: ensure that changes match system-level engineering logic rather than only fixing a local symptom.

### L3: Atomic Execution Layer

- Responsibility: land work at the level of files, functions, entrypoints, commands, build parameters, and verification steps.
- Focus: concrete files, function responsibilities, build commands, log locations, validation methods, and physical fix locations.
- Purpose: remove ambiguity and make work executable, verifiable, and documentable.

---

## 3. Mandatory Rules Before Entering a Project

### 3.1 Read Project Markdown Before Acting

- Every time you start, review, or repair a project, you must read all project `.md` files before entering analysis, modification, packaging, or publishing.
- The purpose is not procedural formality; it is to understand:
  - architecture definitions
  - directory boundaries
  - historical evolution
  - deployment rules
  - release constraints
  - prior troubleshooting lessons
- Before the documentation has been read, do not make assumptions about architecture, deployment, packaging layout, runtime model, account rules, or stable baselines.

### 3.2 Respect the Documentation Entry Hierarchy

- If a project has a unified documentation center, start there instead of scanning random markdown files first.
- If the project has a master README, guide page, or control-center document, treat it as the first entrypoint.

### 3.3 Clarify Task Scope First

- After entering a project, determine whether the current task belongs to:
  - L1: understanding, mapping, planning
  - L2: solution design, architecture, interaction, constraints
  - L3: code changes, builds, validation, release
- Before the task boundary is clear, do not expand scope or add extra work on your own.

---

## 4. Synchronization and Closed-Loop Rules

### 4.1 Read Before Writing

- Read relevant documentation and relevant code before modifying anything.
- Do not change code based only on the surface symptom.

### 4.2 Sync Immediately After Success

- Once code changes are successful, validated, and confirmed, update the relevant markdown immediately.
- Important lessons must not remain only in the chat history.

### 4.3 Minimum Documentation Set

- triggering symptom
- impact scope
- root cause assessment
- modified files
- modification method
- validation method
- if build-related, also include:
  - build command
  - build parameters
  - artifact timestamps
  - install-directory or runtime-directory verification result

### 4.4 Persist Structure Into Markdown

- Any critical structure that has been read, changed, or verified should be written into markdown as precisely as practical:
  - entry files
  - module relationships
  - key function responsibilities
  - path models
  - data flow
  - communication flow
  - dependency flow

### 4.5 Index Failures

- Every build failure, regression, expected risk, and repair action after packaging should be written into markdown.
- The goal is not to “summarize”; the goal is to create a searchable failure index.

---

## 5. Engineering Execution Rules

### 5.1 Plan First

- If the task has more than 3 steps, spans multiple modules, involves refactoring, or touches deployment or release, form a clear execution sequence first.

### 5.2 Verify Before Marking Done

- Nothing is complete until it is validated.
- Validation may include:
  - syntax checks
  - successful builds
  - successful runtime behavior
  - path verification
  - log verification
  - device or machine verification

### 5.3 Prefer Elegant Solutions

- Do not accept patchy temporary fixes as the default.
- Prefer solutions with clean structure, stable boundaries, and maintainable follow-up behavior.

### 5.4 Troubleshoot Proactively

- When a problem can be traced through logs, paths, instance state, or build chains, keep moving until the likely cause is clear.
- Do not hand obvious next-step troubleshooting back to the user too early.

### 5.5 No Unapproved Feature Additions

- Do not add out-of-scope functionality, interactions, state-machine changes, default-behavior changes, visual redesigns, workflow changes, or “small optimizations” without explicit user approval.
- Better options may be proposed, but they must wait for user confirmation before implementation.

---

## 6. Documentation Precision Rules

### 6.1 Markdown Is Not Auxiliary

- Markdown is not an attachment; it is the runtime map, troubleshooting index, and repair archive of the project.

### 6.2 Prefer Precision

- When time allows, documentation should become more specific, not more abstract.

### 6.3 Physical Location Requirement

- Whenever markdown references a function, method, command, or event, it should also provide a file path by default.
- Best form:
  - `function name` + `file path`
  - and when practical, an approximate line or search anchor

### 6.4 Relationship Chains Matter

- Key functions should not be documented only as isolated points.
- Also document:
  - who calls them
  - what they affect next
  - which document section or chain they belong to

### 6.5 Log Location Must Be Explicit

- Log placement is an architectural fact, not an implementation footnote.
- Whenever log behavior changes, verify and document the physical log location.
- If permissions require a fallback path, record it explicitly; never silently change the default destination.

---

## 7. Packaging vs Runtime Verification Protocol

### 7.1 Default Dual Track

- Track A: unpacked testing artifacts
  - such as `win-unpacked`, runnable directories, debug builds, or uninstalled bundles
- Track B: final installers or release packages
  - such as `.exe`, NSIS, MSI, `.dmg`, `.AppImage`, APK, or AAB

### 7.2 Default Order

- Validate feature logic, interactions, state machines, and communication chains in Track A first.
- Move to Track B only when:
  - the user explicitly asks for the final installer
  - the work has reached QA, acceptance, or delivery stage
  - the issue exists specifically in installation, signing, packaging, permissions, upgrade, or uninstall flows

### 7.3 Confirm Packaging Intent First

- Are we testing an unpacked build or producing the final installer?
- Is the current goal feature validation or formal delivery?
- If the user does not explicitly require the final installer, remain in the unpacked-validation stage by default.

### 7.4 High-Risk Checks After Packaging

- install directory
- working directory
- `app.asar`
- config loading
- stale cache hits
- auto-start entries
- scheduled tasks
- leftover processes
- uninstall metadata
- permissions, signing, and file locks
- shared-directory or user-directory path models

### 7.5 Release Asset Completeness Rule

- When a project reaches the stage of GitHub release publication, formal delivery, stable-version archiving, or milestone-version delivery, the release should not contain only installers or executable artifacts.
- By default, the release must also include the source package that corresponds to the exact version being published.
- The “source package” here means a version-aligned source archive for the current tag or release, not an arbitrary snapshot of the current working directory.
- If a project provides:
  - installers
  - unpacked executable bundles
  - source packages
  then the source package should also be included in the same release whenever possible.
- The reasons include:
  - easier rollback
  - easier version auditing
  - easier offline archiving
  - direct access from the release page to the exact source version that matches the installers
- For everyday small fixes that are not entering a formal release flow, a manually attached source package is not mandatory. But once the work becomes a published release, the source package should be treated as a standard release asset.
- After the source package has been uploaded successfully to the GitHub release, any temporary local source zip created only for that upload must be deleted immediately.
- Do not keep ad hoc local source zip files in the workspace, release folder, or staging folders after upload, because they easily accumulate and create version confusion about which archive is the canonical release asset.

---

## 8. Instance Conflict and Cleanup Rules

### 8.1 Client Instance Conflict Rule

- If the same machine keeps multiple client forms at the same time, for example:
  - portable build
  - installed build
  - old copied directory
  - stale installed state
- it may lead to:
  - unclickable UI
  - playlist delivery appearing to succeed while playback does not start
  - the wrong instance being launched
  - behavior that looks like the code was never updated
- Therefore the client startup chain must include conflict cleanup by default.

### 8.2 Minimum Client Cleanup Scope

- old `AdvertisingScreenClient.exe` processes
- auto-start registry entries
- scheduled tasks
- old installation directories
- old portable directories
- old runtime directories
- control directories and local runtime directories that conflict with the current instance

### 8.3 Server Multi-Instance Protection Rule

- The server must enforce single-instance behavior.
- Default strategy:
  - block the second instance
  - wake or open the existing instance
- Multi-instance protection must not automatically erase user business data.

### 8.4 Cleanup Boundary Rule

- Cleaning instance conflicts is not the same thing as clearing user configuration.
- Safe-to-clean targets:
  - conflicting processes
  - auto-start items
  - scheduled tasks
  - old runtime directories
  - old portable directories
  - installation directories that conflict with the current instance
- Do not auto-delete by default:
  - user config files
  - server storage data
  - playlists
  - approval records
  - media libraries
  - installer repositories
- Only delete config and business data when the user explicitly requests a reset, factory reset, or data wipe.

---

## 9. UI / UX and README Presentation Rules

### 9.1 UI / UX Boundary Rule

- UI changes must not pursue “modernization” in isolation; they must match actual product boundaries and interaction reality.
- Any change to state machines, layout structure, or user flow should be treated as a product change, not just a visual change.

### 9.2 README as the Public Landing Page

- A GitHub README is not only documentation; it should also function as the public landing page and first product impression.
- When the task involves the README, repository homepage, release page, or project introduction, do not only increase text density. Also evaluate:
  - first-screen pacing
  - section hierarchy
  - visual impact
  - memorability
- It is acceptable to improve:
  - hero titles and subtitles
  - badges
  - feature matrices
  - version timelines
  - bilingual or multilingual entry points
  - clearer landing-page narrative
- But do not change facts or invent capabilities.
- A README must include a practical “Usage”, “Quick Start”, or equivalent section by default.
- Even if the project is still evolving, the README should not stop at overview and architecture. At minimum, it should tell the reader:
  - how to start using the repository
  - what the main directories are for
  - how to launch or validate the client and server
  - where installer assets or release artifacts are obtained
- If the project is currently more suitable for developer-oriented usage instructions than end-user instructions, the README must still include the minimum executable steps instead of omitting usage entirely.
- When a README needs multilingual support, do not stack full Chinese, English, Japanese, or other full-language content into a single page by default.
- The preferred multilingual README structure is:
  - `README.md` as the primary entry page
  - `README.zh-CN.md` as the Chinese page
  - `README.ja.md` as the Japanese page
  - additional languages following the same independent-file pattern
- Each language page must provide the same language-switch links near the top, for example:
  - `English | 中文 | 日本語`
- The default README should still preserve:
  - title
  - summary
  - badges
  - multilingual entry links
  - the full content of its own language version
- The goal is to support multilingual readers without destroying the landing-page rhythm or readability of the repository homepage.
- When a README is acting as the repository landing page, centered presentation is allowed and recommended for visual coherence, especially for:
  - the main title
  - the subtitle or slogan
  - badges
  - multilingual navigation links
- The purpose of this centered layout is not decoration for its own sake; it is to make the repository homepage feel more like a product landing page than a plain text document.
- If centered presentation is used, the top section should stay structurally consistent when practical:
  - centered title
  - centered subtitle
  - centered badges
  - centered language switch links
- As long as readability and factual clarity are preserved, this top-level Hero-style presentation should be treated as a recommended pattern rather than an optional flourish.

---

## 10. Safety and Validation Protocol

### 10.1 Sensitive Actions Need Rollback Paths

- Deletion, movement, replacement, publishing, cleanup, and overwrite actions must preserve a recovery path or a clearly defined rollback point.

### 10.2 Deep Validation

- Validation must not stop at “it opens”.
- It should cover:
  - empty data
  - invalid input
  - network interruptions
  - low disk space
  - path mismatches
  - installation leftovers
  - stale cache hits

### 10.3 Delivery Must Include Proof

- Delivery should include as much of the following as practical:
  - validation method
  - key results
  - what was not validated
  - remaining risks

---

## 11. Self-Improvement Loop

- Once the user corrects something, the lesson should be written into the correct document quickly.
- At the start of new sessions, review prior lessons and project documentation first.
- When code and markdown differ in information density, prefer enriching the documentation.

---

## 12. Prohibitions

- Do not define the project architecture before reading the project markdown.
- Do not expand the scope before confirming the current task boundary.
- Do not write project-level rules into the wrong directory.
- Do not upload local private notes, temporary notes, or unrelated artifacts into a repository.
- Do not mechanically copy repository-specific rules from project A into project B.

---

## 13. Recommended Execution Order

1. Read all project markdown files first.
2. Confirm the project documentation entrypoint and the current task layer.
3. Read the relevant code and runtime directories.
4. Form the execution sequence and risk judgment.
5. Modify code or prepare release artifacts.
6. Validate the result.
7. Update the correct markdown files.
8. Deliver the conclusion, paths, risks, and next-step suggestions.

---

## 14. Version Note

- This version is `AgentLogic_V5`.
- It is a consolidated version based on `agentlogic.md` and `agentlogic test1.md`.
- It keeps:
  - general engineering rules
  - packaging and documentation rules
  - instance-conflict cleanup rules
  - README presentation rules
- It removes repository-specific appendices that do not belong to the current project.
