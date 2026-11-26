# 错题本 · 费曼融合（MVP）

单题闭环的网页端 MVP：**拍照 → 双通道识别 → 回显确认 → 题目定位 → 首次批改**。
本轮实现到技术说明 §1.3 的 ④ 为止，⑤⑥⑦ 与同类题推荐只保留置灰入口。

- 前端：React 18 + Vite + TypeScript + KaTeX（SPA，不做 SSR）
- 后端：Node BFF（Fastify）+ 统一模型网关
- 数据库：SQLite（better-sqlite3，WAL），多用户数据按 `user_id` 隔离
- 模型：硅基流动 PaddleOCR-VL / DeepSeek + 智谱 GLM-5.3-Flash，密钥只存在服务端 `.env`

---

## 一、快速开始

```bash
cd app
npm install

# 1) 准备环境变量（密钥留空即进入演示模式）
cp .env.example .env      # Windows: copy .env.example .env

# 2) 生成 8 张演示样本图（已随仓库提供，可跳过）
npm run samples

# 3) 启动（前端 5173 + BFF 8787）
npm run dev
```

打开 http://localhost:5173 ，点「用演示账号体验」（`demo@cuoti.local / demo1234`），
在「演示样本」里点任意一张即可跑通全流程。

生产模式（前端由 BFF 直接托管）：

```bash
npm run build
npm run check:secrets     # 扫描构建产物，确认没有模型密钥
npm start                 # http://127.0.0.1:8787
```

> 首次启动会在 `data/app.db` 建库并写入演示账号与 8 条标注样本索引；`data/` 已在 `.gitignore` 中。

### 接真模型

1. 在 `.env` 填入三把密钥：

```ini
SILICONFLOW_KEY_OCR=...        # PaddleOCR-VL
SILICONFLOW_KEY_DEEPSEEK=...   # DeepSeek 自解兜底
ZHIPU_KEY_GLM=...              # GLM-5.3-Flash 手写通道
PROVIDER_MODE=auto             # 三把齐全自动切 live
```

2. 重启服务，进入「设置 → 模型连接 → 测试连接」。
   探活只发 1 token，不会把题目内容送出去；三通道都显示「连通」即已接真模型。

未配置密钥时自动降级到演示样本，界面会明确标注「演示模式」，**不会把 mock 结果伪装成真实识别**。

---

## 二、目录说明

```
app/
├─ apps/
│  ├─ web/                        # React 18 + Vite + TS
│  │  ├─ src/
│  │  │  ├─ App.tsx               # 登录门 + 三个视图（批改台/我的错题/知识脉络）
│  │  │  ├─ pages/
│  │  │  │  ├─ LoginView.tsx      # 登录 / 注册 / 演示账号
│  │  │  │  ├─ UploadView.tsx     # ① 拍照上传 + 演示样本
│  │  │  │  ├─ RecognizeView.tsx  # ② 双通道识别进度（轮询）
│  │  │  │  ├─ ConfirmView.tsx    # ②b 回显确认（左图右文）
│  │  │  │  ├─ GradeView.tsx      # ④ 首次批改
│  │  │  │  ├─ RecordsView.tsx    # 我的错题（标签统计/筛选）
│  │  │  │  └─ BankView.tsx       # 学科脉络 + 指数/对数题库
│  │  │  ├─ components/           # ImageStage / StepCard / Tex / SettingsPanel …
│  │  │  ├─ store/useFlow.ts      # 前端状态机
│  │  │  ├─ lib/{api,image,types}.ts
│  │  │  └─ styles/{tokens,app}.css
│  │  └─ public/                  # manifest + service worker（只缓存外壳）
│  └─ server/
│     ├─ src/
│     │  ├─ index.ts              # Fastify 启动、静态托管、错误处理
│     │  ├─ env.ts                # .env 读取 + mock/live 判定
│     │  ├─ auth.ts               # 注册/登录/JWT/refresh
│     │  ├─ gateway/              # 统一网关：路由、重试、探活、埋点、脱敏
│     │  │  ├─ index.ts           #   call(role=ocr|vision|reason) / healthCheck
│     │  │  ├─ live.ts            #   真实模型调用（OpenAI 兼容）
│     │  │  └─ mock.ts            #   8 条标注样本
│     │  ├─ merge/diff.ts         # 双通道三级比对（字符/公式/切片）
│     │  ├─ grade/                # 步骤对齐 + 首错步 + 标签
│     │  ├─ locate/service.ts     # 题库检索 + 未命中模型自解
│     │  ├─ routes/               # auth / flow / records / models / meta
│     │  ├─ store/db.ts           # SQLite 仓储（建表 + 查询）
│     │  ├─ bank/                 # 题库、样本、学科脉络
│     │  └─ types.ts              # §9 JSON 契约（snake_case）
│     └─ public/samples/          # 8 张演示样本图（生成物）
├─ scripts/
│  ├─ gen-samples.ts              # 由样本数据渲染 PNG（图与 bbox 同源）
│  ├─ e2e.ts                      # ①→④ 全链路自检（8 条样本）
│  ├─ e2e-users.ts                # 多用户注册与数据隔离自检
│  ├─ e2e-live.ts                 # live 通道自检（配合 fake-upstream）
│  ├─ fake-upstream.ts            # 假上游：验证请求/解析/重试
│  ├─ qa-ui.ts                    # 两档视口 UI 走查 + 截图
│  ├─ qa-errors.ts                # 异常态走查
│  └─ check-secrets.mjs           # 构建产物密钥扫描
├─ data/                          # 运行时数据（app.db / uploads）
└─ .env.example
```

---

## 三、环境变量

| 变量 | 说明 |
|---|---|
| `PORT` / `HOST` | BFF 监听地址，默认 `127.0.0.1:8787` |
| `DATA_DIR` | 数据目录（SQLite + 原图），默认 `data` |
| `JWT_SECRET` | JWT 签名密钥，生产必改 |
| `PROVIDER_MODE` | `auto`（默认）/ `mock` / `live` |
| `LLM_TIMEOUT_SEC` | 单次模型调用超时，默认 120s |
| `MODEL_EXAM_POLICY` | `block`（默认）：真题/考试原卷禁止送生成式模型 |
| `SILICONFLOW_BASE_URL` / `SILICONFLOW_KEY_OCR` / `SILICONFLOW_KEY_DEEPSEEK` | OCR 与推理通道 |
| `ZHIPU_BASE_URL` / `ZHIPU_KEY_GLM` | 手写视觉通道 |
| `MODEL_OCR` / `MODEL_GLM` / `MODEL_DEEPSEEK` / `MODEL_ASR` | 模型名（ASR 本轮未使用，保留） |
| `RETRIEVE_MAX_ROUNDS` | 检索轮次上限（本轮为占位） |

`.env` 永不入库、不入日志、不进前端产物；`npm run check:secrets` 会扫描构建结果。

---

## 四、数据与多用户

### 4.1 表结构（SQLite）

| 表 | 作用 | 关键列 |
|---|---|---|
| `users` | 账号 | `email` 唯一、`password_hash`（scrypt + 随机盐） |
| `images` | 原图归档 | `owner_id`、`sha256`、`phash`、`sample_id`、`is_exam_question` |
| `tasks` | 异步任务 | `status` / `stage` / `progress` / `usage_json` |
| `recognitions` | 识别结果快照 | `payload_json`（§9.1） |
| `confirmations` | ConfirmedSolution | `version`、`confirmed_at`、`payload_json` |
| `locates` | 题目定位结果 | `confirm_id` 唯一 |
| `gradings` | 首次批改 | `primary_label`、`overall`、`first_error_step`、`payload_json` |
| `notes` | 自由补充 | 仅本人可见，不入统计 |

索引覆盖 `owner_id + created_at`、`task_id + version`、`owner_id + primary_label`。

### 4.2 隔离

- 所有查询都带 `owner_id = 当前登录用户`；跨账号访问统一返回 404（不泄漏「存在但无权」）。
- 图片通过 `GET /api/images/:id?token=` 提供，`<img>` 无法带 header，因此用短期 access token 走查询参数。
- 注册校验：邮箱格式、唯一性、密码 ≥ 6 位；密码 scrypt 加盐存储。

### 4.3 错因标签口径

- **单题：严格七选一单选**（概念误用 / 条件遗漏 / 公式误用 / 符号错误 / 跳步 / 计算失误 / 审题偏差），这是锁定口径，未改。
- **全局：七类标签全量呈现 + 多选筛选**（「我的错题」页），并给出每类计数；题库节点可挂多个候选标签（`common_errors: []`），首错步命中哪个节点就取该节点的首个标签。
- 「整体要有多个标签」按此实现：不是让单题多选，而是让标签体系完整可用、可统计、可筛选。

---

## 五、接口契约（BFF）

所有接口前缀 `/api`，除注册/登录/元信息外都需要 `Authorization: Bearer <access_token>`。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/register` `/auth/login` `/auth/refresh` | 注册 / 登录 / 续期 |
| GET | `/auth/me` | 当前用户 |
| GET | `/meta` | 模式、样本列表、题库规模、功能开关 |
| POST | `/uploads/presign` | 预签名直传形态（MVP 返回本地代理地址） |
| POST | `/uploads` | 上传原图，返回 `image_uri` 与元数据 |
| POST | `/recognize` | 提交识别任务，返回 `task_id` |
| GET | `/tasks/:id` | 轮询进度 |
| GET | `/recognitions/:task_id` | 识别结果（§9.1） |
| POST | `/solutions/confirm` | 学生确认，产出 ConfirmedSolution（§9.2） |
| POST | `/locate` | 题库定位 / 模型自解兜底（§9.3） |
| POST | `/grade` | 首次批改任务 |
| GET | `/gradings/:task_id` | 批改结果（不含完整推导） |
| GET | `/gradings/:task_id/derivation` | 解锁完整推导（按需） |
| PATCH | `/gradings/:task_id/note` | 自由补充（仅本人可见） |
| GET | `/records` | 我的错题 + 标签统计 |
| GET | `/models/health` | 三通道探活 |

---

## 六、数据流与状态机

```
draft → uploaded → recognizing → recognized → confirming → confirmed
      → locating → located → grading → graded
```

- 识别/批改都是异步长任务：提交后返回 `task_id`，前端每 550ms 轮询，不阻塞 UI。
- **ConfirmedSolution 是下游唯一输入**：`POST /grade` 只接受 `confirm_id`，并校验它是最新版本（`409 STALE_CONFIRM`）；不存在的确认返回 `409 CONFIRM_REQUIRED`。代码里没有「置信度高就跳过确认」的分支。
- 冲突未裁定：服务端二次校验，返回 `409 CONFLICT_UNRESOLVED`；前端按钮同时禁用。
- 完整推导默认收起：列表接口不下发正文，只有点「解锁完整解析」才请求 `/derivation`。

### 判分说明（重要）

数学对错无法用文本相似度判定——把 `<` 写成 `>` 只差一个字符，相似度几乎不变。因此分两层：

1. **对齐层**：用（表示层归一后的）公式覆盖率把学生步骤映射到标准解节点；
2. **判定层**：演示样本带作者标注的节点级 verdict（相当于测试 oracle）；学生一旦改动该步骤，该节点立即回退到文本比对，并把置信度压到 0.6 以下、标注「低置信」。

真实模式下没有 oracle，判定完全走文本比对，置信度会偏低并明确标注——**不会假装确定**。接真模型后若需要更强的判分，应在 `gateway.call('reason')` 上增加「步骤等价性判定」调用（本轮未做，见「已知缺口」）。

---

## 七、自检脚本

```bash
# 全链路（需先启动 BFF，默认 8787）
npm run test:e2e        # 8 条样本：识别→确认→定位→批改，含两条硬约束
npm run test:users      # 注册/登录/隔离：跨账号读数据必须 404
npm run test:ui         # 1440 / 375 两档：登录→闭环→记录→设置，测横向溢出
npm run test:errors     # 异常态：演示模式下上传非样本图片

# live 通道（两个终端）
npm run fake:upstream
PROVIDER_MODE=live PORT=8788 DATA_DIR=data-live \
SILICONFLOW_BASE_URL=http://127.0.0.1:8899/v1 SILICONFLOW_KEY_OCR=test SILICONFLOW_KEY_DEEPSEEK=test \
ZHIPU_BASE_URL=http://127.0.0.1:8899/api/paas/v4 ZHIPU_KEY_GLM=test \
npx tsx apps/server/src/index.ts
npm run test:live       # 断言 live 解析、503 重试 2 次、未命中兜底
```

---

## 八、本轮自检结果

| 验收项 | 结果 |
|---|---|
| 单题端到端可走通 | ✅ `test:e2e` 8/8 通过（含全对、错、部分正确、未命中） |
| 确认不可跳过 | ✅ 服务端 `CONFIRM_REQUIRED` / `CONFLICT_UNRESOLVED` / `STALE_CONFIRM` 三重校验，e2e 有断言 |
| 批改含答案/方法/3–7 步/首错步/主标签 | ✅ 8 条样本标签分别为 概念误用·跳步·条件遗漏·符号错误·公式误用·审题偏差·全对 |
| 完整推导默认收起 | ✅ `/locate` 不下发正文，`/gradings` 不含正文，需显式解锁 |
| 缺失/低置信/未检索到均有标注 | ✅ 低置信 banner + 依据；未命中显式「未检索到原题，以下为模型独立解答」 |
| 前端产物无密钥 | ✅ `check:secrets` 扫描 65 个文件，0 命中 |
| 两档布局无横向滚动 | ✅ 1440 / 375 下 `scrollWidth == innerWidth`；登录/上传/确认/批改/记录/脉络六页均测 |
| 未出现范围外功能 | ✅ ⑤⑥⑦ 与同类题入口全部置灰并标注「后续迭代」 |
| 多用户隔离 | ✅ `test:users` 20 条断言通过（跨账号 5 个接口全部 404） |
| 真模型通道 | ✅ 假上游验证：三通道解析、503 指数退避重试 2 次、未命中兜底；真实密钥待你本地验证 |

---

## 九、已知缺口与偏差（如实记录）

1. **live 通道未用真实厂商密钥联调**：本机 `.env` 为空，只用本地假上游验证了协议与解析。填入密钥后请先跑「设置 → 测试连接」。
2. **判分 oracle**：演示样本带作者标注；真实模式仅文本比对，置信度偏低并标注。技术说明未定义判分模型调用，本轮未擅自新增锁定口径外的流程。
3. **多档案切换**（家长/学生多档案）未实现：本轮做了「多账号」，每个账号独立数据；档案级切换属于 §12.3 的后续项。
4. **手机号验证码登录**未实现：采用邮箱 + 密码（自建账号），JWT + refresh 形态与说明一致。
5. **物理学科脉络**无教材资料支撑，按人教 2019 版通用目录自拟，仅作导航，页面顶部有明确提示。
6. **感知哈希阈值**（汉明距离 ≤5）文档未锁定数值，已做成可调常量；演示模式按 `sample_id` 隔离去重，避免不同题目误判重复。
7. **PDF 归档 / 艾宾浩斯 / 费曼**：仅置灰入口，未实现。
8. **音频通道**：`MODEL_ASR` 与 `SILICONFLOW_KEY_ASR` 仅保留在 `.env`，本轮不涉及。

---

## 十、后续迭代建议

1. 把「步骤等价性判定」做成网关的第四个 role（`judge`），真实模式下用它替代文本比对；
2. 题库指纹升级为「文本 + 公式结构 + 图形区域」三路召回，落地双路互校；
3. 接入对象存储预签名直传，替换本地目录；
4. ⑤ 艾宾浩斯调度与 ⑥ 费曼追问共用本轮的 `error_localization.followup_seeds`。
