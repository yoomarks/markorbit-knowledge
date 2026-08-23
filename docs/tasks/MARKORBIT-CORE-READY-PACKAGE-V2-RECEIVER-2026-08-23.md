# MarkOrbit/Core 正式对接任务书：ReadyPackage V2 Receiver

- **任务编号：** `CORE-KV2-2026-08-23`
- **目标仓库：** `yoomarks/markorbit`（MarkOrbit/Core）
- **任务类型：** 跨仓协议接收端、持久化与集成验证
- **优先级：** P0（Knowledge → Core 生产激活阻塞项）
- **建议实现位置：** `services/core`，紧邻现有 V1 Knowledge intake；不得迁移或重写 V1
- **Knowledge 前置基线：** `yoomarks/markorbit-knowledge@3932b7cd5ee0235d3bb0f9e23ceab7cc71e45f7d`（包含 PR #394 与 PR #395）

## 1. 交付目标

在 Core 中新增一个专用、可恢复、幂等的 ReadyPackage V2 Delivery Protocol V1 接收端。它接收 Knowledge 已冻结的 `ReadyPackageV2DeliveryRequestV1`，验证原始请求字节、Workspace 与内容完整性，将 Content Export V2 及交付证据不可变地写入 PostgreSQL，并返回可被 Knowledge 严格校验的 `ReadyPackageV2DeliveryResultV1`。

完成本任务不代表内容已成为法律事实、商标事实或 Core 语义结论；本阶段只负责可信传输、完整性验证、持久化和可恢复回执。

## 2. 冻结输入契约

Core 必须以 Knowledge 当前主干中的下列文件为规范源，不得自行扩展或宽松解析：

- `packages/contracts/src/ready-package-v2-delivery-v1.ts`
- `packages/contracts/src/ready-package-content-export-v2.ts`
- `packages/contracts/src/ready-package-v2.ts`
- `docs/architecture/READY_PACKAGE_V2_DELIVERY_V1.md`

### 2.1 Transport

- Method: `POST`
- 推荐路径：`/internal/knowledge/ready-packages/v2/deliveries`
- `Content-Type: application/json`
- `Idempotency-Key: <Knowledge frozen key>`，必填
- `x-markorbit-internal-authorization: <shared internal secret>`，沿用 Core 既有内部鉴权机制
- `x-markorbit-ready-package-v2-delivery-protocol: 1.0`，必填且必须精确匹配
- 请求体上限必须显式配置；不得使用不足以容纳 Markdown 的默认 64 KiB。建议沿用或不高于现有 V1 12 MiB 安全上限，并在交付回执中报告最终值。

该 URL 必须独立于 V1 `/internal/knowledge/ready-packages/intakes`，V2 不得回退或转发到 V1。

### 2.2 Request

```ts
type ReadyPackageV2DeliveryRequestV1 = {
  protocolVersion: "1.0";
  objectType: "READY_PACKAGE_V2_DELIVERY_REQUEST";
  deliveryId: string; // rvd_*
  readyPackageId: string; // rdp_*
  knowledgeWorkspaceId: string; // wsp_*
  target: {
    service: "MARKORBIT_CORE";
    workspaceId: string; // canonical Core UUID
  };
  readyPackageDigest: string; // lowercase SHA-256 hex
  contentExportSha256: string; // lowercase SHA-256 hex
  contentExport: ReadyPackageContentExportV2;
  submittedAt: string; // RFC3339 timestamp
};
```

对象键必须精确匹配。未知字段、缺失字段、V1 对象、大小写或 ID 形状错误都必须 fail closed，不得强制转换。

### 2.3 Result

```ts
type ReadyPackageV2DeliveryResultV1 = {
  protocolVersion: "1.0";
  objectType: "READY_PACKAGE_V2_DELIVERY_RESULT";
  deliveryId: string;
  readyPackageId: string;
  status: "RECEIVED" | "ACCEPTED" | "REJECTED";
  requestSha256: string;
};
```

`requestSha256` 必须是 Core 实际收到的冻结请求原始 UTF-8 字节的 SHA-256。不得用挑选字段、解析后任意 `JSON.stringify` 结果或 `contentExportSha256` 代替。

## 3. 实现工作包

### CORE-KV2-WP-01：Ingress 与原始字节冻结

- 为接收路由增加可选 raw-body 能力；不得改变其他 route 的解析行为。
- 鉴权、协议头、Content-Type、Idempotency-Key、body limit 在 JSON 业务处理前验证。
- 计算并保存原始请求字节的 SHA-256。
- 严格校验 V2 request/result 与 Content Export V2。
- 使用 `target.workspaceId` 查询规范 Core Workspace；不存在或不匹配时确定性拒绝。
- 为 V1 endpoint 添加不变性回归测试。

### CORE-KV2-WP-02：PostgreSQL 不可变交付账本

至少持久化：

- delivery ID、ReadyPackage ID；
- Core Workspace ID、Knowledge Workspace ID；
- Idempotency-Key 的安全持久标识；
- request SHA-256、ReadyPackage digest、Content Export SHA-256；
- 完整且不可变的 Content Export V2；
- consumer status、received/accepted/rejected 时间；
- migration version 与审计时间。

约束：

- 同一 Workspace + Idempotency-Key + 相同原始请求：返回首次结果，不重复插入内容。
- 同一 Idempotency-Key + 不同原始请求：409/fail closed。
- 并发重复请求：只产生一个逻辑 delivery 与一份内容。
- 进程重启后精确重放：返回同一协议结果。
- 已持久化的 request/content/result 不允许 UPDATE 或 DELETE 覆盖；状态推进如有需要，使用受约束状态机与追加审计。

### CORE-KV2-WP-03：内容与 provenance 完整性

Core 必须重新计算并验证：

1. `contentExportSha256` 对应 Knowledge 规范序列化的 Content Export V2；
2. `content.sha256` 对应嵌入 Markdown 的 UTF-8 字节；
3. `content.sizeBytes` 对应同一字节长度；
4. `contentAddressedRef === cas:sha256:<content.sha256>`；
5. 外层/内层 ReadyPackage ID、Knowledge Workspace 与 digest 一致；
6. media type 为 `text/markdown`、encoding 为 `utf-8`；
7. `provenance.origin.kind === "VAULT_IMPORT"` 且完整保留 inspection、review、import、verification、finalization 与 binding 证据；
8. `legalTruthVerified === false` 原样保存。

不得伪造 V1 conversion provenance，不得把 `ACCEPTED` 解释为法律或业务语义正确。

### CORE-KV2-WP-04：结果与恢复语义

- 首版推荐只在 request、Workspace、digest、content 和不可变持久化全部成功后返回 `ACCEPTED`。
- 只有实现了明确的 durable-received 中间态时才使用 `RECEIVED`。
- `REJECTED` 只表示确定性的协议/完整性/Workspace 消费端拒绝；不得表达语义真伪。
- 持久化成功但响应丢失时，精确重试必须返回原 `ACCEPTED` 和相同 `requestSha256`。
- 不确定错误不得生成伪成功结果。

### CORE-KV2-WP-05：跨仓真实集成证明

使用固定的 Knowledge 与 Core commit，真实 HTTP、真实 Core PostgreSQL、Knowledge SQLite 关闭/重开，覆盖：

1. prepare → submit → Core `ACCEPTED` → Knowledge finalize；
2. Core 持久化后响应丢失 → Knowledge 用同一 request/key 重试 → Core 无重复内容；
3. Knowledge 已持久化 Core result、在本地 finalize 前重启 → 不再发 HTTP，只本地完成；
4. Knowledge 冻结 submission/audit 损坏 fixture → outbound 被阻止；
5. Core 确定性拒绝 → Knowledge 进入 operator review，不自动重试；
6. 同 key 不同 body → Core 冲突拒绝；
7. 并发重复提交 → 单一 durable delivery；
8. V1 intake/content E2E 全部保持不变。

## 4. HTTP 行为最低要求

- 未授权或错误 secret：401/403，不持久化业务对象。
- 缺失或错误协议头：400/422，不持久化。
- 缺失 Idempotency-Key：400，不持久化。
- 超出 body limit：413，不解析或持久化业务对象。
- 严格契约失败：400/422，返回稳定错误码。
- Core Workspace 不存在：404 或稳定的确定性拒绝。
- digest/content hash 不匹配：422，返回稳定错误码。
- 同 key 不同 request：409。
- 首次成功：200/201，并返回合法 `ACCEPTED` result。
- 精确重放：200，并返回首次持久结果。

具体错误 envelope 沿用 Core 现有规范；成功 body 必须严格符合 Result V1。

## 5. 明确非目标与权限锁

- 不修改 Knowledge 仓库协议或 K14–K16 的 retry/reconciliation 语义。
- 不迁移、重写或复用 V1 endpoint。
- 不将 V2 转成 V1。
- 不引入自动重试、后台语义处理或 AI 解释。
- 不直接写 Knowledge SQLite、Vault 或其执行状态。
- 不引入跨服务 SQL。
- 不把 `ACCEPTED` 当成法律事实、商标事实、建议或能力判断。
- 不在本任务中自动部署生产或启用 Knowledge 的 V2 URL。

## 6. 验收门禁

Core PR 合并前必须全部满足：

- format、lint、typecheck、unit/integration、build 全绿；
- Core 支持的所有 Node/runtime 矩阵全绿；
- PostgreSQL migration 正反向/重建验证通过；
- raw-body SHA、严格对象键、所有 digest、内容字节与 Workspace 绑定测试通过；
- 幂等重放、冲突、并发、重启与响应丢失测试通过；
- V1 回归全绿；
- 跨仓 E2E 八个场景全绿；
- 安全审查确认日志不包含 internal secret、Idempotency-Key、完整 Markdown 或未经脱敏的请求体。

## 7. Core 完成后必须回传的交付回执

请向 Knowledge 提交一份不可歧义的完成回执，包含：

- Core PR URL、合并 commit SHA、migration ID；
- 最终专用 V2 endpoint；
- 所需 headers 与环境变量名；
- body size 上限；
- raw request SHA 算法与字节来源说明；
- PostgreSQL 表/索引/唯一约束摘要；
- 每个跨仓场景对应的 CI/E2E run URL；
- 使用的 Knowledge commit SHA、Core commit SHA、fixture/request/content SHA-256；
- V1 回归 run URL；
- 明确声明是否只支持 `ACCEPTED`，以及是否实现 `RECEIVED` 中间态。

只有 Knowledge 核验该回执、在非生产环境完成一次显式提交并持久化 `ACCEPTED` 证据后，才可另行审批生产配置 `MARKORBIT_CORE_V2_DELIVERY_URL`。本任务本身不授权生产激活。
