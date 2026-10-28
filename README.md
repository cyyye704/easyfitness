# EasyFitness

EasyFitness 是一个移动端优先的饮食、训练、恢复与个人基线记录工具，使用 Vite + React + TypeScript 构建。未配置 Supabase 时保留浏览器本地模式；配置后通过邮箱登录，正式记录与档案按账号保存在 Supabase Postgres。DeepSeek 只生成待确认草稿或阶段文字小结，所有 AI 接口均要求有效登录。

首次启用云端请按 [Supabase 配置与上线步骤](docs/supabase-setup.md) 完成项目、数据库迁移、邮箱验证、SMTP、回调地址和 Vercel 环境变量设置。仓库中的实现与模拟测试不等于真实项目已经完成配置或联调。

## 当前功能

- 记录每日体重、睡眠和训练，手动新增、删除饮食
- 自动汇总热量、蛋白质，按通用规则显示“加分 / 持平 / 扣分”
- 历史记录、减脂通识课程、未估算饮食记录
- 最近 7 天、30 天或自定义周期的聚合与 AI 阶段总结
- 自然语言 AI 记录：解析、编辑、处理冲突、确认后追加
- 个人基线：首次描述、最多五个固定补充问题、完整复核与独立编辑/清除
- 本地身体模型：读取最新体重，计算 BMI 参考值与可解释的模型层级
- 邮箱注册、验证、登录、退出及忘记密码/重置密码
- 登录后的个人记录与档案云端保存，数据库 RLS 隔离不同账号
- 旧本地记录与档案经复核确认后导入，冲突默认保留云端
- 黑红视觉系统与健身房、跑道、球场背景渐变

## 数据流与存储边界

```text
页面编辑 / 确认 AI 草稿
  -> DailyRecord / UserProfile 状态入口
  -> 本地模式：storage.ts / profileStorage.ts -> localStorage
  -> 云端模式：数据仓库 -> Supabase Postgres -> 当前用户的 RLS 策略

自然语言 + 当前用户 access token
  -> 同源 /api/ai/* Vercel Function
  -> 输入校验 -> AI 开关 -> Supabase Auth 实时验证
  -> DeepSeek -> 响应校验 -> 浏览器待确认草稿
```

AI Function 不写数据库，不保存用户正文，也不接受用户密码。浏览器直接通过 Supabase SDK 读写当前用户的正式数据，数据库以 `auth.uid() = user_id` 强制限制权限。修改或清除档案不影响每日记录。

旧版 `easyfitness.records.v1`、`easyfitness.profile.v1` 保留为本地数据；登录不会自动上传、覆盖或删除它们。导入时先比较记录和档案，默认只补充云端缺失项，相同内容跳过；冲突必须由用户明确选择是否覆盖。导入不会上传未确认草稿。

每日 AI 草稿只在当前页面临时保存。个人基线引导草稿仅在当前浏览器按账号隔离暂存，不进入云端；退出或切换账号不能沿用另一账号的草稿。Supabase SDK 独立管理登录会话。

云端保存失败会显示错误，不能视为已经同步，也不会静默切回本地。多个设备同时编辑同一记录时，版本检查会阻止旧版本直接覆盖新版本；需要重新加载并确认后再保存。当前没有持久化的离线写入队列或实时协作；失败的修改只保留在当前页面，保存成功前不要刷新或关闭。

## 个人身体基线与 AI 合并规则

首次没有已完成档案时可以进入个人基线引导，也可以暂时跳过。DeepSeek 只参与第一次自然语言整理；后续固定问题由前端处理，完成复核后才保存正式档案。本地身体模型实时计算，不持久化派生结果，也不由 AI 计算。

- AI 食物按草稿顺序追加在当天已有食物之前，保留已有食物并生成新的正式 ID
- 训练内容在原记录后换行追加；完全相同则不重复
- 已有体重和睡眠默认保留，只有明确选择后才替换
- 空白食物或热量、蛋白质最终值都无效的食物会被忽略
- 当前记录日期始终优先，过期草稿不能改写其他日期

## 本地开发

```bash
npm install
cp .env.example .env.local
npm run dev
```

不填 Supabase 变量即可开发本地记录功能。只配置一半或使用错误的公开配置会显示配置错误，不会假装已连接云端。

需要登录和云端数据时，先完成 [配置指南](docs/supabase-setup.md)，再填写 `.env.local`。`npm run dev` 的 Vite 服务支持前端直接访问 Supabase，但不托管 `/api`；验证 DeepSeek 功能需完整本地环境：

```bash
npm run dev:full
```

Vercel CLI 首次运行可能要求登录并关联项目。已有项目也可以执行 `vercel link`、`vercel env pull .env.local` 后启动。拉取变量会写入该文件，已有手写配置需先保存。`.env.local` 和 `.vercel` 已被 Git 忽略。

## 环境变量

| 变量 | 使用位置 | 说明 |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | 浏览器构建 | Supabase 项目根 URL；与下面的服务端 URL 一致 |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 浏览器构建 | `sb_publishable_` 开头的公开发布密钥 |
| `SUPABASE_URL` | AI Function | 同一 Supabase 项目 URL，用于实时验证登录 |
| `SUPABASE_PUBLISHABLE_KEY` | AI Function | 同一公开发布密钥，仅用于 Auth 验证 |
| `AI_FEATURE_ENABLED` | AI Function | `true` 才开启 AI，其他值返回 `AI_DISABLED` |
| `DEEPSEEK_API_KEY` | AI Function | DeepSeek 秘密密钥，启用 AI 时必填 |
| `DEEPSEEK_MODEL` | AI Function | 可选，默认 `deepseek-v4-flash` |

前两个变量均为空时采用本地模式。启用云端与 AI 时四个 Supabase 变量均需配置且指向同一项目；服务端缺失配置会返回 `AUTH_NOT_CONFIGURED`，不会把 AI 接口变成公开接口。缺少/无效登录返回 `AUTH_REQUIRED`，鉴权网络异常或超时返回 `AUTH_UNAVAILABLE`，不把临时网络故障当成会话失效。

只有 Supabase URL 和公开发布密钥可以使用 `VITE_` 前缀；它们会进入浏览器产物。DeepSeek Key、SMTP 密码、数据库密码等秘密不得使用该前缀，也不得写入源码、日志或业务存储。本项目不需要 `service_role` 或 `sb_secret_`，也不接受旧式 JWT API key 代替新版 publishable key。

## 检查与构建

```bash
npm test
npm run lint
npm run build
```

自动测试使用纯函数和模拟网络，不访问真实 Supabase/DeepSeek，也不需要真实密钥。`npm test` 自动发现 `tests/*.test.ts` 和 `tests/*.test.mjs`；生产构建同时类型检查前端和 API。

[数据库验证 SQL](supabase/tests/workspace.sql) 需在已应用迁移的测试 Supabase 项目单独执行；它验证真实 RLS、跨账号写入拒绝和版本冲突，并回滚测试数据。Node 测试不替代这一步，也不验证实际邮件投递。

## 部署到 Vercel

1. 按 [配置指南](docs/supabase-setup.md) 建立 Supabase 项目，执行迁移，启用邮箱验证并配置 SMTP 与回调地址。
2. 导入仓库，Framework Preset 选择 Vite，Build Command 为 `npm run build`，Output Directory 为 `dist`。
3. 添加四个 Supabase 变量、`AI_FEATURE_ENABLED=true`、`DEEPSEEK_API_KEY`；按需添加模型变量，并确认 Production/Preview/Development 的作用域。
4. 保存变量后重新部署。`VITE_` 变量在构建时写入产物，修改设置不会自动改变旧部署。
5. 先在 Preview 检查注册、邮件确认、密码重置、两个账号隔离、云端保存/重载、导入冲突和 AI 草稿确认，再决定是否发布 Production。

三个 AI Function 的最长运行时间是 35 秒，为 Supabase 验证最多 5 秒、DeepSeek 总超时 25 秒及响应处理保留余量。DeepSeek 只对允许重试的上游异常最多重试一次。

代码和文档不会自动创建项目、执行远端 SQL、配置 SMTP、提交或部署。真实云端联调结果应以完成配置后的实际验证为准。

## 数据与隐私

- 本地模式数据和未确认个人引导草稿仍依赖当前浏览器；清除站点数据会删除这些内容及本地会话，云端已保存的正式数据不会因此删除
- 同一账号可在其他设备登录后读取已成功保存的云端记录；尚未保存成功的页面更改不保证恢复
- 用户密码只发送到 Supabase Auth；AI 请求携带 access token 进行验证，不携带密码或 refresh token
- 每日自然语言与首次个人描述通过 Vercel Function 发往 DeepSeek；确认后的记录/档案通过 Supabase 保存
- 阶段 AI 小结只发送前端计算的区间聚合指标，不发送逐日明细或个人档案；小结不写入正式记录
- API 响应使用 `Cache-Control: no-store`；服务端日志仅包含请求 ID、耗时、错误类别、上游状态码、重试状态和功能标识
- 日志不记录 token、邮箱、正文、提示词、正式档案或秘密密钥
- 登录校验不等于消费限流；公开运营仍需结合平台速率限制与 DeepSeek 消费预警，当前未实现按用户计费或全局配额系统

## 项目结构与修改入口

```text
api/
  ai/                   三个 AI Function 入口
  _lib/aiHandler.ts      输入、开关、鉴权、业务调用、错误响应与安全日志
  _lib/auth.ts           使用服务端配置向 Supabase Auth 实时验证 token
  _lib/http.ts           HTTP 校验与 no-store 响应
  _lib/deepseek.ts       DeepSeek 请求、总超时和有限重试
src/
  auth/                 Supabase 客户端、会话、回调和登录错误处理
  data/                 云端仓库、运行时校验、版本控制和旧数据导入计划
  ai/                   每日 AI 草稿、共享请求、校验与确认合并
  profile/              档案、问题引擎、本地草稿与 BodyModel
  periodSummary/        本地聚合、校验与 AI 请求
  components/           页面、账号表单、记录与草稿复核组件
  App.tsx               账号对应的数据工作区及页面组合
  App.css / styles/     样式入口与分模块样式
  index.css             全局视觉变量与基础重置
  storage.ts            旧本地每日记录保存与恢复
  knowledge.ts          减脂通识内容
  types.ts / utils.ts    正式业务类型与日期、汇总、评价工具
supabase/migrations/    数据表、RLS 与版本触发器
supabase/tests/         真实数据库策略验证 SQL
tests/                  无真实网络的自动化测试
docs/supabase-setup.md  配置与上线步骤
```

组件通过状态入口和数据仓库保存，不直接拼接数据库写入。三个前端客户端保留各自请求体、提示文案和响应校验，公共请求层负责登录 token、POST、取消与错误处理。API Function 不导入浏览器 Supabase 单例；领域校验仍与 UI、网络和存储解耦。

## 当前边界

- 不做复杂图表、社交、团队共享或管理员后台
- 不做多轮 AI 对话，也不允许 AI 未经确认保存正式数据
- 不做离线写入队列、实时协作或未确认的旧数据上传/冲突覆盖
- 不做医疗诊断、体脂猜测或个体化 BMR/TDEE、热量、蛋白质与训练饮食计划
- BMI 是身高体重参考，不等于体脂率或医学诊断；每日评分尚未按个人档案个体化
