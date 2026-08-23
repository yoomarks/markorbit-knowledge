# MarkOrbit/Core 正式对接任务书
## Knowledge → Core ReadyPackage V2 Consumer Completion & Cross-Repository Acceptance

**任务编号：** `MO-KNOWLEDGE-CORE-KV2-COMPLETION-2026-08-23`  
**任务日期：** 2026-08-23  
**任务优先级：** P0  
**发送仓库：** `yoomarks/markorbit-knowledge`  
**目标仓库：** `yoomarks/markorbit`（MarkOrbit/Core）  
**任务性质：** 已有跨仓协议接收能力的生产级收口、不可变持久化、恢复语义与真实 E2E 验收  
**本任务是否授权生产激活：** 否  
**本任务是否授权修改 Knowledge：** 否；Core 只提交 Core 仓变更，Knowledge 侧由 Knowledge Agent 独立验收  

---

# 0. 必须先读：事实基线与任务修订

本任务是对 Knowledge PR #396 所发任务的**事实基线修订版 / 执行版**。

## 0.1 当前锁定基线

### Knowledge
- Repository: `yoomarks/markorbit-knowledge`
- Current `main`: `5e68862f3e9b7a6522ab0e22aeccd1a426b9cebc`
- Protocol / implementation baseline used by #396:
  `3932b7cd5ee0235d3bb0f9e23ceab7cc71e45f7d`
- Current open PR: none
- ReadyPackage V2 Delivery Protocol: `1.0`
- ReadyPackage Content Export V2 contract: `2.0`

### Core
- Repository: `yoomarks/markorbit`
- Current `main`: `a8035efff46a2e71a4613abd1927b18dadff086b`
- Current open PR: none
- Existing V2 implementation origin:
  - PR #91: `feat(core-kv2): add ReadyPackage V2 ingress and durable delivery ledger`
  - PR #91 merge commit: `0551fc49a9adb683463162237f71de8970807020`
  - existing migration: `0048_core_knowledge_v2_deliveries`
  - existing endpoint:
    `POST /internal/knowledge/ready-packages/v2/deliveries`
  - current body limit: 12 MiB
  - current normal successful durable status: `RECEIVED`

## 0.2 最重要的修订

**不得把本任务理解为“新增一个 V2 Receiver”。**

Core 已经有：
- 独立 V2 route；
- raw request body；
- exact request SHA-256；
- internal service authentication；
- protocol header；
- deterministic `Idempotency-Key`；
- Core Workspace lookup；
- 12 MiB body limit；
- Content Export SHA-256 检查；
- Markdown byte size / SHA-256 检查；
- PostgreSQL durable delivery ledger；
- restart-safe exact replay；
- same identity / different bytes conflict；
- V1 与 V2 route 分离；
- migration `0048_core_knowledge_v2_deliveries`。

**本任务从这个真实基线继续。**

当前缺口不是“有没有入口”，而是：

> **现有 Core V2 consumer 仍停在 durable `RECEIVED`，尚未完成 Knowledge 冻结的 Content Export V2 / Vault provenance 全量完整性验收、最终 `ACCEPTED` 消费语义、持久化后响应丢失恢复、以及 Knowledge↔Core 八项真实跨仓 acceptance。**

因此：

- `CORE-KV2-WP-01`：视为已完成，必须回归验证，不得重写。
- `CORE-KV2-WP-02`：基础版本已完成，允许仅以**新增 migration**做必要增强；不得改写历史 migration 0048。
- 本批主要实施：`WP-03`、`WP-04`、`WP-05`。
- 若审计发现 WP01/02 有真实 correctness / security defect，可做最小修复，但不得借机重构成熟边界。

---

# 1. 跨仓职责边界

## 1.1 Knowledge 负责

Knowledge 负责：
- 外部证据获取；
- Source / Collection governance；
- RawArtifact；
- Conversion / Staging；
- Canonical downstream document；
- ReadyPackage；
- ReadyPackage V2 Delivery Request 冻结；
- Content Export V2；
- Vault-origin provenance；
- outbound retry / reconciliation；
- Knowledge 本地 finalize。

Knowledge 不负责：
- Core PostgreSQL；
- Core consumer acceptance；
- Core 业务语义；
- 法律判断；
- MarkReg / Payment / Execution truth。

## 1.2 Core 负责

Core 负责：
- 接收已冻结的 V2 request；
- 验证 transport / exact bytes / Workspace / contract / digests；
- 验证并不可变保留 Content Export V2 与 Vault provenance；
- 产生 durable consumer result；
- 保证幂等、并发、重启与响应丢失恢复；
- 返回 Knowledge 可严格验证的 `ReadyPackageV2DeliveryResultV1`。

## 1.3 `ACCEPTED` 的含义

`ACCEPTED` 只表示：

> Core 已对 frozen request、Workspace、Content Export V2、内容字节、digest、provenance 进行规定的完整性验证，并已将 consumer evidence 可靠持久化。

`ACCEPTED` **不表示**：
- 法律事实正确；
- 商标状态正确；
- 内容具有法律效力；
- Brain 已完成分析；
- MarkReg 已接受状态；
- Payment 已发生；
- Filing 已提交；
- Official Truth 已形成；
- 用户应该采取任何行动。

`legalTruthVerified` 必须继续保持 `false`。

---

# 2. 冻结协议源

Core 必须按以下 Knowledge 基线读取规范，不得自行扩展、宽松解析或重新定义：

Repository:
`yoomarks/markorbit-knowledge@3932b7cd5ee0235d3bb0f9e23ceab7cc71e45f7d`

规范文件：
- `packages/contracts/src/ready-package-v2-delivery-v1.ts`
- `packages/contracts/src/ready-package-content-export-v2.ts`
- `packages/contracts/src/ready-package-v2.ts`
- `docs/architecture/READY_PACKAGE_V2_DELIVERY_V1.md`

本任务不授权修改这些协议。

---

# 3. 已冻结 Transport Contract

## Endpoint

```http
POST /internal/knowledge/ready-packages/v2/deliveries
```

必须保持独立于：

```http
POST /internal/knowledge/ready-packages/intakes
```

V2 不得：
- 转发到 V1；
- 降级成 V1；
- 复用 V1 persistence 表作为替代；
- 改变 V1 HTTP 行为。

## Required headers

```text
Content-Type: application/json
Idempotency-Key: ready-package-v2-delivery:<deliveryId>
x-markorbit-internal-authorization: <internal secret>
x-markorbit-ready-package-v2-delivery-protocol: 1.0
```

## Body limit

现有 Core 路由为 12 MiB。

除非有明确安全证据要求收紧，本任务应保持该显式上限，并在 completion receipt 中报告最终值。

---

# 4. Frozen Request / Result

## 4.1 Request

```ts
type ReadyPackageV2DeliveryRequestV1 = {
  protocolVersion: "1.0";
  objectType: "READY_PACKAGE_V2_DELIVERY_REQUEST";
  deliveryId: string;             // rvd_*
  readyPackageId: string;         // rdp_*
  knowledgeWorkspaceId: string;   // wsp_*
  target: {
    service: "MARKORBIT_CORE";
    workspaceId: string;          // canonical Core UUID
  };
  readyPackageDigest: string;     // lowercase SHA-256
  contentExportSha256: string;    // lowercase SHA-256
  contentExport: ReadyPackageContentExportV2;
  submittedAt: string;
};
```

## 4.2 Result

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

`requestSha256` 必须继续基于：

> Core 实际收到的原始 request UTF-8 bytes

不得改为：
- parse 后重新 stringify；
- 选取字段；
- Content Export hash；
- ReadyPackage digest。

---

# 5. WP-00 — 先审计现有 Core V2，不得重做

开始编码前必须确认 current `main` 上以下事实仍成立：

- V2 endpoint 唯一；
- raw body 只对需要它的 route 提供，不改变其他 route 解析语义；
- internal auth 在业务写入前；
- protocol header 被严格验证；
- Idempotency-Key 必填并与 `deliveryId` 冻结；
- target Core Workspace 必须真实存在；
- 12 MiB body limit；
- exact request SHA；
- Content Export digest；
- content byte size；
- content SHA；
- PostgreSQL `knowledge_v2_deliveries`；
- exact replay；
- concurrent duplicate；
- V1 regression。

若全部成立，WP00 只形成审计记录，不重写。

## 历史 migration 锁

**不得修改已合并的 `0048_core_knowledge_v2_deliveries.sql`。**

如需增加：
- accepted/rejected timestamp；
- immutable consumer evidence；
- transition audit；
- additional integrity evidence；
- unique/index/constraint；

必须使用 **Core 当前 next available migration number** 新增 migration。

---

# 6. WP-03 — Content Export V2 与 Vault provenance 完整性

现有 Core 只验证了部分 digest。现在必须完成 frozen Content Export V2 全量消费验证。

## 6.1 Exact object shape

所有对象必须 exact-key / fail-closed。

未知字段、缺失字段、错误 object type、错误 version、错误 ID shape 均不得容忍或静默剥离。

## 6.2 外层与内层一致性

必须验证：

```text
request.readyPackageId
  == contentExport.readyPackageId

request.knowledgeWorkspaceId
  == contentExport.knowledgeWorkspaceId

request.readyPackageDigest
  == contentExport.readyPackageDigest
```

同时必须验证 target：

```text
request.target.service == "MARKORBIT_CORE"
request.target.workspaceId == canonical existing Core Workspace
```

## 6.3 Content Export canonical digest

必须按 Knowledge 的：

```text
serializeReadyPackageContentExportV2(...)
```

规范序列化重新计算：

```text
SHA-256(canonical Content Export V2 UTF-8 bytes)
```

并严格等于：

```text
request.contentExportSha256
```

## 6.4 Markdown content integrity

必须验证：

```text
UTF8(content.content).byteLength == content.sizeBytes
SHA256(UTF8(content.content)) == content.sha256
content.contentAddressedRef == "cas:sha256:" + content.sha256
content.mediaType == "text/markdown"
content.encoding == "utf-8"
```

## 6.5 Canonical document

必须保留：
- `canonicalDocument.documentId` (`cdd_*`)
- `canonicalDocument.promotedAt`

不得在 Core 接收时重新生成一个伪 canonical-document identity。

## 6.6 Vault import provenance

必须完整验证并不可变保留下列 origin：

```text
kind == "VAULT_IMPORT"
inspectionRunId
importIntentId
importExecutionId
vaultStagingDocumentId
verificationId
verificationOutcome
finalizationId
rootFingerprintSha256

binding.bindingId
binding.revision
binding.relativeRoot

vaultRelativePath
bindingRelativePath

observedAt
reviewedAt
importedAt
verifiedAt
```

其中：
- `verificationOutcome` 只能是协议允许的值；
- 所有 contract IDs 必须符合 frozen prefix；
- `rootFingerprintSha256` 必须是 lowercase SHA-256；
- binding revision 必须为正安全整数；
- timestamps 必须可解析；
- 所有 provenance 必须原样保留；
- 不得转换成 V1 conversion provenance；
- 不得省略路径 / binding evidence。

## 6.7 Legal-truth boundary

必须：

```text
contentExport.provenance.legalTruthVerified === false
```

Core 接收不得将其改为 true，也不得生成“等效已验证”状态。

---

# 7. WP-04 — Durable Consumer Acceptance

## 7.1 推荐的 v1 最简语义

对于新正常交付：

> 只有当所有 transport / Workspace / contract / digest / content / provenance 验证完成，且 consumer row / evidence durable 后，才返回 `ACCEPTED`。

如果没有业务需要，不要人为新增异步两阶段流程。

## 7.2 `RECEIVED`

协议保留 `RECEIVED`，但：

- 不得继续把“正常完整成功”永久停在 `RECEIVED`；
- 只有实现了明确、可恢复的 durable-received 中间态才使用；
- 中间态必须有确定的后续 reconciliation；
- 不允许后台无审计自动升级。

## 7.3 现有历史 `RECEIVED` 记录

若开发 / 测试环境已存在旧 `RECEIVED`：

- 不得通过 migration 批量静默改为 `ACCEPTED`；
- 不得仅凭状态名称升级；
- 若需要 reconcile，必须重新读取 durable frozen request 并执行完整 WP03 验证；
- 生产不存在历史数据时，也要有测试证明升级策略不会伪造 acceptance。

## 7.4 `REJECTED`

`REJECTED` 只表示确定性 consumer rejection，例如：
- invalid contract；
- Workspace mismatch；
- digest mismatch；
- provenance invalid；
- content mismatch。

它不代表法律 / 业务结论。

若当前 Core error-envelope 设计更适合用非 2xx + error code 表达确定性拒绝，可保持现有 error envelope；但 Knowledge 必须能够将其可靠分类为 deterministic rejection / operator review。

## 7.5 Persistence immutability

必须确保：
- frozen request bytes identity 不变；
- request JSON 不被覆盖；
- Content Export 不被覆盖；
- first durable consumer result 可重放；
- same key + same request 精确 replay；
- same key + different exact request：409；
- concurrent duplicate：一个逻辑 delivery；
- restart 后 exact replay：同一 result；
- accepted result 的 `requestSha256` 永远一致。

禁止用：

```sql
UPDATE ... SET request_json = ...
```

覆盖历史输入。

若使用 status transition：
- transition 必须是受约束状态机；
- 最好追加 transition/audit evidence；
- 禁止 `ACCEPTED -> RECEIVED`；
- 禁止 `ACCEPTED -> REJECTED`；
- 禁止通过普通业务写随意改状态。

---

# 8. WP-04B — HTTP 行为最低要求

至少保持 / 达到：

| 场景 | 预期 |
|---|---|
| wrong/missing internal secret | 401/403；无业务持久化 |
| wrong/missing protocol header | stable 4xx；无业务持久化 |
| missing Idempotency-Key | 400；无业务持久化 |
| key != frozen delivery identity | 409 |
| body > limit | 413；无业务持久化 |
| invalid exact contract | 400/422 |
| missing Core Workspace | 404 或稳定 deterministic rejection |
| Content Export digest mismatch | 422/稳定 4xx |
| Markdown SHA/size mismatch | 422/稳定 4xx |
| invalid Vault provenance | 422/稳定 4xx |
| same key / different exact bytes | 409 |
| first fully valid durable consumer acceptance | 200/201 + `ACCEPTED` |
| exact replay | 200 + original durable `ACCEPTED` |
| concurrent duplicates | one logical durable acceptance |

现有 Core 错误码可沿用，但必须稳定、可测、不可把不确定内部错误伪装成 acceptance。

---

# 9. WP-05 — 八项真实跨仓 E2E

这是本任务的核心 merge gate。

必须使用：
- fixed Knowledge commit；
- fixed Core commit；
- real HTTP；
- real Core PostgreSQL；
- real Knowledge SQLite；
- 真实 process close/reopen 或等价新进程；
- 真实 protocol serialization；
- 不 mock 掉跨服务 transport / persistence boundary。

## E2E-01 Normal accepted delivery

```text
Knowledge prepare
→ frozen request
→ Core HTTP
→ Core validates
→ Core durable ACCEPTED
→ Knowledge persists result
→ Knowledge finalize
```

验收：
- 单一 delivery；
- exact request SHA 相同；
- Core `ACCEPTED`；
- Knowledge finalized；
- `legalTruthVerified=false`。

## E2E-02 Core persists then response is lost

模拟：
- Core 已 durable `ACCEPTED`；
- response 未被 Knowledge 收到。

Knowledge 再用：
- 同 frozen bytes；
- 同 Idempotency-Key；
- 同 delivery ID；

重试。

验收：
- Core 不重复 consumer content；
- 返回第一次 durable `ACCEPTED`；
- same `requestSha256`；
- Knowledge 可安全 finalize。

## E2E-03 Knowledge receives result then restarts before finalize

模拟：
- Knowledge 已 durable 保存 Core result；
- finalize 前 Knowledge process 关闭；
- 新进程 / reopen SQLite。

验收：
- 不再次发送 HTTP；
- 本地 reconciliation 完成 finalize；
- Core delivery count 不增加。

## E2E-04 Knowledge frozen submission corruption

破坏 fixture：
- frozen request；
- submission audit；
- digest / serialized bytes；

任一关键一致性。

验收：
- Knowledge outbound fail closed；
- Core 不收到 request；
- 无 consumer business write。

## E2E-05 Deterministic Core rejection

制造确定性 invalid content / provenance / Workspace。

验收：
- Core stable rejection；
- Knowledge 进入 operator review / deterministic failure；
- 不自动无限 retry；
- 不 finalize。

## E2E-06 Same key, different body

验收：
- Core 409；
- 原 durable delivery 不变；
- 不生成第二份 content / result。

## E2E-07 Concurrent duplicate

并发提交完全相同 frozen request。

验收：
- one logical delivery；
- one immutable content；
- 所有成功客户端获得一致 result；
- 无 race-created duplicate。

## E2E-08 V1 regression

必须证明现有：
- V1 intake；
- V1 content；
- 相关 consumer E2E；

行为完全不变。

V2 不得 fallback 到 V1。

---

# 10. Security / logging gates

Core 日志不得包含：
- internal secret；
- 完整 `Idempotency-Key`（如现有日志政策允许 hash / redacted form则按现有规范）；
- 完整 Markdown；
- 未脱敏完整 request body；
- Vault 路径以外任何不应公开的本地秘密；
- credentials。

错误日志允许：
- delivery ID；
- request SHA；
- stable error code；
- redacted workspace / correlation evidence；
- 不含内容正文的 integrity dimensions。

---

# 11. CI / Merge Gate

Core PR 合并前必须满足：

- format；
- lint；
- typecheck；
- unit tests；
- integration tests；
- build；
- Core 支持 Node/runtime matrix 全绿；
- PostgreSQL migration fresh-apply / replay / reset matrix 全绿；
- Core V2 dedicated workflow 全绿；
- V1 regression 全绿；
- eight cross-repo E2E 全绿；
- concurrency / restart / response-loss 全绿；
- security logging test / review通过；
- exact PR head 的所有相关 required checks completed/success。

任何 live-source / unrelated flaky job 若不影响本任务，也必须在合并说明中解释，不得无说明跳过 required gate。

---

# 12. Core 完成后必须回传给 Knowledge 的 Completion Receipt

请生成一份正式 Markdown completion receipt，并提交到 Core PR 或作为明确 PR comment / artifact 回传。

至少包含：

## Identity
- Core PR URL
- PR number
- final PR head SHA
- merge commit SHA
- Core final `main` SHA
- Knowledge exact baseline SHA

## Persistence
- new migration ID(s)
- 是否保持 0048 未修改
- table / columns / audit table
- unique constraints
- indexes
- immutable / transition constraints

## Transport
- final endpoint
- required headers
- env var names
- body limit
- raw request SHA algorithm
- exact raw bytes source

## Semantics
- first valid success final status
- whether `RECEIVED` intermediate state is used
- deterministic rejection policy
- exact replay behavior
- concurrent replay behavior
- response-loss behavior

## Integrity
明确逐项声明已经验证：
- outer / inner IDs
- workspace
- readyPackage digest
- contentExport SHA
- Markdown SHA
- byte size
- CAS ref
- media type
- encoding
- Vault provenance
- `legalTruthVerified=false`

## Evidence
每个 E2E-01～08：
- run URL
- job name
- exact commit(s)
- PASS result

另外：
- V1 regression run URL
- migration/restart/concurrency run URL
- fixture request SHA-256
- fixture Content Export SHA-256
- fixture content SHA-256

---

# 13. 本任务明确不做

本任务不授权：

- 修改 Knowledge contracts；
- 修改 Knowledge retry/reconciliation 语义；
- 重写 V1；
- 删除 V1；
- V2 → V1 fallback；
- 新建第二套 V2 endpoint；
- 新建第二套 delivery identity；
- 改写 migration 0048；
- 自动生产部署；
- 打开 production `MARKORBIT_CORE_V2_DELIVERY_URL`；
- 生产 credential；
- live filing；
- provider contact；
- Payment；
- MarkReg lifecycle mutation；
- Official Truth；
- legal reasoning；
- Brain semantic processing；
- cross-service SQL；
- 未经审批的后台自动 external retry。

---

# 14. 与 Data Engine G1 的并行边界

Core 当前 `main` 已接受 Data Engine G0 provider freeze 和 joint decisions。

该主线下一步为 `MO-DE-006 G1 Protected Query Runtime`。

**Knowledge V2 Completion 与 Data Engine G1 是并行跨仓集成，不得混成一个框架重构。**

共享原则可以复用：
- authenticated internal boundary；
- correlation / trace；
- immutable evidence；
- deterministic errors；
- workspace isolation；
- restart/replay。

但：
- 不共享业务表；
- 不共享协议；
- 不用 Data Engine work 作为 Knowledge V2 completion 的阻塞理由；
- 不因本任务开始 `MO-DE-007/008`。

---

# 15. 后续阶段（不属于本次实现授权）

Knowledge 后续还有：
- objective Change Evidence feed；
- remaining Wave 1 production validation；
- source acquisition evidence。

这些未来可能需要 Core 消费，但**本次 P0 只收口 ReadyPackage V2**。

Acquisition Intelligence Phase 1 是 Knowledge 内部 acquisition-policy learning，不要求 Core 复制或实现。

---

# 16. Done Definition

只有同时满足以下条件，才可以向 Knowledge 回报“Core side complete”：

1. 现有 V2 receiver 被增量完成，而不是另造一套；
2. 完整 Content Export V2 + Vault provenance 验证；
3. fully valid normal delivery 返回 durable `ACCEPTED`；
4. exact replay / conflict / concurrency / restart / response-loss 都正确；
5. V1 不变；
6. 八项真实跨仓 E2E 全绿；
7. completion receipt 完整；
8. exact PR head relevant CI 全绿。

即使 Core side complete，仍然：

> **不等于 Knowledge→Core 生产激活完成。**

Knowledge Agent 必须独立核验 completion receipt，并在非生产环境完成显式真实 delivery acceptance 后，才可另行讨论生产 V2 URL 激活。
