# MarkOrbit Knowledge PRD v1.0

> **产品名称**：MarkOrbit Knowledge  
> **定位**：Mo 的可视化信息采集与知识预处理管理平台  
> **文档类型**：PRD  
> **版本**：v1.0 Draft  
> **状态**：待评审  
> **关联项目**：MarkOrbit Core、Mo Crawl、Obsidian、Mo Lite  
> **更新时间**：2026-07-15

---

# 1. 执行摘要

MarkOrbit Knowledge 是 MarkOrbit / Mo 体系的信息入口控制平面，统一管理数据源、采集计划、采集工具、分布式 Worker、原始文件、去重与版本、格式转换、Obsidian Vault 同步以及 Ready Package 交付。

它不负责知识理解、能力构建、价值评分或推荐。其核心目标是将网页、API、邮箱、本地文件、数据库和人工上传的 Raw Data，转换为可追溯、可版本化、可在 Obsidian 中加工、可被 MarkOrbit Core 稳定读取的 Markdown Staging Document。

```text
Sources
  ↓
MarkOrbit Knowledge
  ↓
Mo Crawl / Connectors / Workers
  ↓
Raw Artifact Store
  ↓
Markdown + YAML
  ↓
Obsidian Knowledge Staging
  ↓
Ready Package
  ↓
MarkOrbit Core
```

一句话定义：

> **MarkOrbit Knowledge 管理信息如何进入、保存、更新、转换和交付；MarkOrbit Core 负责理解这些信息以及从中创造价值。**

# 2. 背景与问题

Mo 未来需要持续处理：

- 商标局官网、公告和指南；
- 法律法规、判决和新闻；
- 代理机构网站；
- PDF、Word、Excel、CSV、JSON；
- 邮件与附件；
- 用户本地案件资料；
- 数据库导出；
- GitHub 与技术资料。

若直接交给 Core，会出现来源分散、重复采集、版本混乱、文件不可追溯、格式不统一、采集工具形成孤岛、缺乏可视化管理等问题。

Obsidian 已具备 Markdown、YAML、Wiki Links、Backlinks、Graph、Canvas、Bases 和 Git 协作能力，因此 MarkOrbit 无需从零开发完整知识编辑器。Knowledge 应重点建设统一协议、控制平台、文件与版本体系、转换器以及 Vault Adapter。

# 3. 产品定位与边界

## 3.1 正式定位

> **Acquisition & Knowledge Staging Control Plane**

MarkOrbit Knowledge 是：

- Source Registry；
- Acquisition Orchestrator；
- Raw Artifact Registry；
- File & Version Manager；
- Converter Orchestrator；
- Obsidian Vault Adapter；
- Ready Package Publisher；
- 可视化运维后台。

## 3.2 不属于本项目

以下能力必须留在 MarkOrbit Core：

- Information Engine；
- Entity Resolution；
- Distillery；
- Knowledge / Capability / Skill；
- Value Factory；
- Brain Runtime；
- Intelligence；
- 用户匹配与 Today Feed。

边界原则：

```text
Knowledge：资料怎么进来、怎么保存、怎么变成规范 Markdown。
Core：资料是什么意思、有什么价值、能形成什么能力。
```

# 4. 产品目标

1. **统一数据源**：网页、API、邮箱、本地文件夹、数据库和上传入口均以 SourceDefinition 管理。
2. **统一采集工具**：Mo Crawl、API Connector、Email Connector、Local Worker 等均作为可替换 Provider。
3. **Raw 可追溯**：任何 Markdown 都能追溯到来源、采集任务、原始文件、工具版本、时间和 Hash。
4. **统一版本**：自动识别重复、更新和历史版本。
5. **统一格式**：输出 Markdown + YAML + 附件引用 + Provenance。
6. **可视化操作**：支持查看、筛选、测试、预览、采集、检查更新、重试、对比和同步。
7. **稳定交付 Core**：Core 只消费通过校验的 Ready Package。

# 5. 产品原则

- **控制面与执行面分离**：Knowledge 管理，Worker 执行。
- **API First**：后台、CLI、Worker 和 Agent 使用同一 API。
- **Provider 可替换**：Crawl4AI 只是默认 Web Provider。
- **Raw Immutable**：原始文件不覆盖，变化生成新版本。
- **Schema Driven**：配置、按钮、参数和校验由 Manifest / Schema 驱动。
- **Local First**：用户本地资料默认留在本地。
- **Workspace Isolation**：公共、企业、Workspace 和用户私有数据严格隔离。
- **Evidence First**：所有结果保留完整来源。
- **Obsidian 可替换**：架构依赖 Knowledge Staging，不绑定具体软件。
- **Core 只读取 Ready Package**。

# 6. 用户角色

- **Platform Admin**：全局 Connector、Worker、安全、存储和审计。
- **Knowledge Admin**：数据源、采集计划、文件、转换、Vault 和 Package。
- **Operator**：日常检查、采集、重试和冲突处理。
- **Reviewer**：在 Obsidian 中阅读、关联、修改并标记 Ready。
- **Developer**：开发 Connector、Converter、Worker 与 Adapter。
- **Workspace Owner**：管理本 Workspace 的本地数据源与同步策略。

# 7. 系统架构

```text
┌──────────────────────────────────────────┐
│ MarkOrbit Knowledge Admin UI             │
│ Dashboard / Sources / Jobs / Files       │
│ Workers / Connectors / Vault / Packages  │
└──────────────────────────────────────────┘
                    ↓
┌──────────────────────────────────────────┐
│ MarkOrbit Knowledge API                  │
│ Registry / Scheduler / Artifacts / Sync  │
└──────────────────────────────────────────┘
          ↓              ↓              ↓
   Mo Crawl Worker   Local Worker   Converter Worker
   Crawl4AI          Local Files    PDF/DOCX/HTML
          └──────────────┼──────────────┘
                         ↓
                 Raw Artifact Store
                         ↓
                 Staging Document
                         ↓
                   Obsidian Vault
                         ↓
                   Ready Package
                         ↓
                  MarkOrbit Core
```

# 8. 核心功能模块

## 8.1 Dashboard

展示：

- 数据源总数、启用数、异常数；
- 今日采集、成功、失败、重试；
- 新增、更新、重复文件；
- 待转换、待同步、Vault 冲突；
- 在线 / 离线 Worker；
- 最近页面变化；
- 最近错误；
- Ready Package 状态。

快速操作：

- 新建数据源；
- 手工上传；
- 检查高优先级数据源；
- 查看失败任务；
- 同步 Vault；
- 构建 Package。

## 8.2 数据源管理

支持数据源类型：

- WEB；
- API；
- EMAIL；
- LOCAL_FOLDER；
- DATABASE；
- GITHUB；
- RSS；
- MANUAL_UPLOAD。

列表字段：

- 名称、类型、分类、国家、权威等级；
- Connector、状态、计划、最近采集；
- 最近变化、文件数、Workspace、标签。

筛选：

- 国家、类型、分类、Provider、状态、时间、Workspace、标签、是否变化。

详情页操作：

- 测试连接；
- 发现页面；
- 预览采集；
- 立即采集；
- 检查更新；
- 查看版本；
- 重新转换；
- 同步 Obsidian；
- 暂停 / 恢复；
- 复制 / 归档。

操作按钮由 Connector Capability 动态生成。

## 8.3 采集计划

支持：

- 手动、Hourly、Daily、Weekly、Monthly、Cron、Change Watch；
- 优先级；
- Include / Exclude；
- 最大深度和页面数；
- JS 渲染；
- 附件；
- robots；
- 限速；
- 超时；
- 重试；
- 语言和选择器。

## 8.4 任务中心

任务类型：

```text
WEB_DISCOVERY
WEB_CRAWL
PAGE_UPDATE_CHECK
API_COLLECTION
EMAIL_IMPORT
LOCAL_FILE_SCAN
DOCUMENT_CONVERSION
VAULT_EXPORT
VAULT_IMPORT
PACKAGE_BUILD
```

任务状态：

```text
PENDING → LEASED → RUNNING → UPLOADING → VERIFYING → COMPLETED
```

异常状态：

```text
RETRY / FAILED / DEAD_LETTER / CANCELLED
```

支持取消、重试、重新分配和查看日志。

## 8.5 Worker 管理

记录：

- 节点、系统、区域、网络、版本；
- CPU、内存、最大并发；
- Capability；
- Workspace Scope；
- 心跳、状态、当前任务。

支持：

- 启用、禁用、排空；
- 修改并发；
- 撤销 Token；
- 查看日志；
- 重新分配任务。

## 8.6 Connector Registry

Connector Manifest：

```yaml
id:
name:
version:
source_types:
capabilities:
configuration_schema:
secret_schema:
output_types:
health_check:
```

MVP Connector：

- Crawl4AI Web；
- Manual Upload；
- Local Folder。

后续：

- Generic REST API；
- GitHub；
- Gmail / Outlook；
- RSS；
- Database；
- SFTP。

## 8.7 文件与 Raw Artifact

每个 Artifact 记录：

- 来源；
- 文件名；
- MIME；
- Size；
- Binary Hash / Content Hash；
- 采集时间；
- 发布时间；
- 当前版本；
- Duplicate Status；
- Conversion Status；
- Vault Status；
- Workspace。

操作：

- 查看 / 下载；
- 预览 Markdown；
- 对比版本；
- 重新转换；
- 修改非证据元数据；
- 标记重复；
- 同步 Vault；
- 归档。

## 8.8 去重与版本

规则：

```text
相同来源 + 相同 Hash → 重复
相同逻辑文档 + 不同 Hash → 新版本
不同来源 + 高相似度 → 疑似转载，仅提示
```

支持文本、Markdown、HTML 主体和 Metadata Diff。

## 8.9 Converter Registry

统一接口：

```text
RawArtifact → Converter → StagingDocument
```

首批 Converter：

- HTML / Crawl4AI → Markdown；
- PDF → Markdown；
- DOCX → Markdown；
- TXT → Markdown；
- JSON → Markdown；
- CSV / XLSX → Markdown + Data Attachment；
- EML → Markdown。

记录 Converter 版本、参数、输入输出 Hash、警告和错误。

## 8.10 Staging Document

最低 YAML：

```yaml
id:
title:
source_id:
source_type:
source_url:
country:
published_at:
captured_at:
content_hash:
raw_artifact_ref:
status:
converter:
converter_version:
workspace_id:
visibility:
```

正文必须包含 Provenance 和附件引用。

## 8.11 Obsidian Vault

支持：

- Workspace 绑定 Vault；
- 配置路径、仓库、分支、目录映射；
- 单个 / 批量导出；
- 从 Vault 回读 Markdown、YAML、Wiki Links；
- 检查无效 YAML、重复 ID、断链、缺失附件和冲突；
- 生成 Git Diff；
- 冲突策略：KEEP_VAULT、KEEP_SYSTEM、CONFLICT_COPY、MANUAL_REVIEW。

## 8.12 Ready Package

仅包含：

- status = ready；
- Schema 校验通过；
- ID 唯一；
- Raw 可追溯；
- 无阻断错误。

Package 状态：

```text
DRAFT → VALIDATING → READY → PUBLISHED
```

支持通过文件、对象存储或 API 交付 Core。

# 9. 核心数据模型

```text
Workspace
User
Role
SourceDefinition
SourceCategory
CollectionPlan
CollectionRun
ConnectorProvider
ConnectorCapability
WorkerNode
WorkerCapability
Job
JobLease
RawArtifact
ArtifactVersion
LogicalDocument
ConversionProfile
ConversionRun
StagingDocument
VaultBinding
VaultSyncRun
ReadyPackage
ReadyPackageItem
ErrorEvent
AuditEvent
```

关键关系：

```text
Workspace
  ├── SourceDefinition
  ├── WorkerNode
  ├── RawArtifact
  ├── VaultBinding
  └── ReadyPackage

SourceDefinition
  ├── CollectionPlan
  ├── CollectionRun
  └── RawArtifact

RawArtifact
  ├── ArtifactVersion
  └── ConversionRun

ConversionRun
  └── StagingDocument
```

# 10. API 与协议

API 分组：

```text
/api/workspaces
/api/sources
/api/plans
/api/jobs
/api/workers
/api/connectors
/api/artifacts
/api/conversions
/api/staging-documents
/api/vaults
/api/packages
/api/errors
/api/audit
```

Worker 通过 HTTPS 主动注册、心跳、领取任务、续租和上传结果。中央系统只发送声明式任务，禁止远程执行任意 Shell、Python 或 PowerShell。

CollectionRequest 示例：

```yaml
request_id: REQ-001
source_id: USPTO_NEWS
job_type: WEB_CRAWL
provider: crawl4ai
target:
  url: https://www.uspto.gov/news
policy:
  allowed_domains: [uspto.gov]
  max_depth: 2
  render_js: false
  respect_robots: true
  rate_limit_per_minute: 10
output: [html, markdown, metadata]
```

# 11. Crawl4AI 技术决策

- Crawl4AI 作为默认 Web Acquisition Engine；
- 通过 Mo Crawl Adapter 接入；
- 固定版本，不使用 `latest`；
- Knowledge 不依赖 Crawl4AI 内部模型；
- 保留 Direct HTTP、Playwright、Official API 等 Provider；
- 第一阶段直接使用 SDK；
- 只有必须修改上游核心能力时才维护最小 Fork。

```text
Knowledge → CollectionRequest → Mo Crawl → Crawl4AI → CollectionResult
```

# 12. 权限、安全与隐私

## 数据域

- PUBLIC；
- ORGANIZATION；
- WORKSPACE_PRIVATE；
- USER_LOCAL。

## 安全要求

- Workspace 隔离；
- 最小权限；
- Worker 主动连接；
- 短期设备 Token；
- Domain Allowlist；
- SSRF 防护；
- 禁止内网和云元数据地址；
- robots 与全局限速；
- MIME 与文件大小校验；
- 原始附件不直接执行；
- 全量 Audit Log；
- 用户可撤销授权与申请删除。

## 本地同步

- Raw Sync；
- Metadata Sync；
- Value Only（仅预留协议，由 Core 产生）。

# 13. 非功能需求

- 数据源 10,000 条内筛选响应 < 2 秒；
- 任务列表查询 < 2 秒；
- 至少支持 100 个 Worker 心跳；
- Job Lease、Version、Package 发布必须幂等；
- Worker 掉线后任务可恢复；
- Connector、Converter、Vault Adapter 必须有 Contract Test；
- 所有任务具备 Trace ID；
- Markdown / YAML 为开放格式；
- MVP 可用性目标 99.5%。

# 14. MVP 范围

## 必须实现

页面：

1. Dashboard；
2. 数据源；
3. 任务中心；
4. 文件与版本；
5. Obsidian 同步；
6. 基础 Worker / Connector / Package 管理。

数据源：

- WEB；
- MANUAL_UPLOAD；
- LOCAL_FOLDER。

Connector：

- Crawl4AI；
- Manual Upload；
- Local Folder Worker。

文件：

- HTML、Markdown、PDF、DOCX、TXT、JSON、CSV。

操作：

- 新建数据源；
- 测试连接；
- 预览采集；
- 立即采集；
- 检查更新；
- 查看 / 重试任务；
- 查看文件与 Diff；
- 转换 Markdown；
- 导出 / 回读 Vault；
- 构建 Ready Package。

## 不在 MVP

- Knowledge Graph；
- 自动关系判断；
- Capability / Skill；
- Value 评分；
- Today Feed；
- 实时 Gmail / Outlook；
- 自动 Git 冲突合并；
- 大规模消息队列。

# 15. 实施路线

## Phase 0：规范锁定

- PRD；
- Architecture；
- Source Schema；
- Connector Manifest；
- Raw Artifact Schema；
- Staging Document Schema；
- Ready Package Schema；
- Worker Protocol。

## Phase 1：Foundation

- Repository；
- API；
- PostgreSQL；
- Workspace；
- Source Registry；
- Audit；
- Object Storage 接口。

## Phase 2：Web Acquisition

- Crawl4AI Provider；
- Mo Crawl Worker；
- Job Lease；
- Raw Artifact；
- Dashboard。

## Phase 3：Files & Conversion

- File Center；
- Versioning；
- HTML / PDF / DOCX Converter；
- Markdown Preview；
- Diff。

## Phase 4：Obsidian Integration

- Vault Binding；
- Export / Import；
- YAML 校验；
- Wiki Link 回读；
- Conflict 检测。

## Phase 5：Ready Package

- Builder；
- Manifest；
- Validation；
- Publish API；
- Core Contract。

## Phase 6：Distributed Workers

- Worker Registry；
- Capability Scheduling；
- Windows Local Worker；
- Node Dashboard；
- Retry / Dead Letter。

# 16. 验收标准

1. 管理员可新增 Crawl4AI 网站数据源并筛选、查看、操作。
2. 可在详情页测试连接、预览、采集和检查更新。
3. 任何 Markdown 均可追溯到 Source、Collection Run 与 Raw Artifact。
4. 重复内容不产生重复逻辑文档。
5. 内容变化产生新版本并支持 Diff。
6. HTML、PDF、DOCX 可转换为标准 Markdown。
7. 系统可写入 Obsidian Vault，并回读 YAML 与 Wiki Links。
8. 只有校验通过且 READY 的文档可进入 Package。
9. Worker 掉线后任务可重新分配。
10. 新增示例 Connector 不需要修改 Source 核心模型和主要列表页面。

# 17. 成功指标

MVP 目标：

- 采集成功率 ≥ 95%；
- Markdown 转换成功率 ≥ 90%；
- Raw 追溯完整率 = 100%；
- 重复识别率 ≥ 95%；
- Vault 同步成功率 ≥ 95%；
- 关键操作审计覆盖率 = 100%；
- Ready Package 校验通过率 ≥ 95%。

# 18. 风险与缓解

- **范围膨胀**：严格执行 Knowledge / Core 边界。
- **Obsidian 插件依赖**：核心只依赖 Markdown、YAML、Links 和文件系统。
- **Crawl4AI 变化**：Adapter、固定版本、Contract Test、Provider 可替换。
- **分布式过重**：MVP 使用 PostgreSQL Job + Lease，后期再引入消息队列。
- **本地资料安全**：Local-first、同步模式、Workspace 隔离。
- **Vault 冲突**：稳定 ID、Hash、Git Diff、冲突副本。
- **存储增长**：去重、压缩、生命周期、配额和冷存储。

# 19. 待决策事项

1. `markorbit-knowledge` 是否独立仓库；
2. Mo Crawl 是否独立仓库；
3. 对象存储采用本地文件系统还是 S3 兼容方案；
4. Vault 为内置目录还是用户自选目录；
5. Git 同步是否进入 v1.0；
6. PDF Converter 首选方案；
7. Windows Local Worker 的安装与更新方式；
8. Ready Package 通过文件、API 还是事件交付 Core；
9. 公共数据与私有数据是否分库；
10. 首批 POC 数据源名单。

# 20. 首批 POC

数据源：

- 1 个官方商标新闻网站；
- 1 个官方指南页面；
- 5 个代理机构网站；
- 1 份涨价通知 PDF；
- 1 个本地测试文件夹。

节点：

- 1 个 Linux Web Worker；
- 1 个 Windows Local Worker。

验证：

- Source 创建；
- 页面发现；
- Raw 保存；
- Hash 去重；
- 版本变化；
- Markdown 转换；
- Obsidian 写入与回读；
- Ready Package；
- Worker 掉线恢复。

# 21. 最终产品定义

> **MarkOrbit Knowledge 是 Mo 的可视化信息采集与知识预处理控制平台。它统一管理数据源、采集计划、采集工具、分布式 Worker、原始文件、版本变化、格式转换和 Obsidian 同步，并通过标准 Ready Package 向 MarkOrbit Core 交付可追溯、可版本化、可继续加工的信息。**

最终分工：

```text
MarkOrbit Knowledge
管理信息入口

Mo Crawl / Connector / Worker
执行采集与转换

Obsidian
组织、关联和预处理

MarkOrbit Core
理解、精馏、构建知识与能力

Mo Lite
将价值与行动交付给用户
```

---

# 22. 开发启动条件

- [ ] PRD Approved
- [ ] Architecture Approved
- [ ] Schema v1 Locked
- [ ] API Contract Locked
- [ ] POC Sources Confirmed
- [ ] Repository Decision Confirmed
