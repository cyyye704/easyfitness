# COROS 官方 MCP 接入

EasyFitness 通过 COROS 官方 OAuth + MCP 读取最近 7 天的睡眠和活动热量。用户预览、选择日期并确认后，才通过 `DailyRecord → updateRecord → DataRepository` 保存。此连接不替代 Supabase 邮箱登录，也不调用 DeepSeek。

## 启用步骤

1. 完成 [Supabase 配置](supabase-setup.md)，确认网页可以登录并保存正式记录。
2. 在 Supabase SQL Editor 按顺序执行新增迁移 [202611040001_coros_records.sql](../supabase/migrations/202611040001_coros_records.sql)。它为现有 `daily_records.data` 增加可选 COROS 数据约束，并防止旧客户端更新时抹掉该字段；没有新增数据表、服务角色或修改 RLS。
3. 在 Vercel 的目标环境增加以下**服务端**变量，然后按既有发布流程部署：

| 变量 | 配置 |
| --- | --- |
| `COROS_APP_ORIGIN` | 实际访问的站点 origin，生产使用 `https://easyfitness.top`，不能带路径、查询参数或片段 |
| `COROS_COOKIE_SECRET` | 32 字节密码学随机密钥的标准 base64 编码，44 字符且末尾为 `=`；不要使用 `VITE_` 前缀 |
| `COROS_CLIENT_ID` | 可留空，程序使用 COROS 官方动态注册；预注册时必须是支持 PKCE、认证方式 `none` 的公有客户端 |
| `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` | 与前端对应同一项目，沿用已有服务端登录校验配置 |

保持密钥稳定以便浏览器持续解密连接；更换密钥会使现有 COROS 连接失效，需要重新授权，但不会影响已保存的记录。不要把真实值提交到仓库或输出到应用日志。

开发时可使用 `COROS_APP_ORIGIN=http://localhost:3000` 和 `npm run dev:full`。仅运行 `npm run dev` 不提供 `/api/coros`。可以在本地 shell 用以下命令生成临时开发配置（不输出密钥）：

```sh
export COROS_APP_ORIGIN=http://localhost:3000
export COROS_COOKIE_SECRET="$(openssl rand -base64 32)"
npm run dev:full
```

每次重新生成密钥，旧连接都要重新授权。持久开发配置应保存在被 Git 忽略的 `.env.local` 中。Preview 和 Production 应分别设置 origin 和密钥；访问别名必须与配置 origin 一致。COROS 回调是 `${COROS_APP_ORIGIN}/api/coros`，与 Supabase 登录回调分开。

4. 先将手表数据同步到手机 COROS App。在 EasyFitness 的“同步手表记录”选择账号地区，点击“连接 COROS”，在官方页面登录授权。
5. 返回后点击“读取最近 7 天”，对照手机 App 核对日期、睡眠和活动热量。选择需要导入的日期，并决定是否替换当前睡眠时长，最后确认记录。

## 数据规则

- 通过 `queryDailyHealthData({days:7})` 和 `querySleepOverview({days:7})` 读取；没有后台轮询、定时任务、训练计划写入或第三方账户密码收集。
- 睡眠归属 COROS 账号时区的醒来日期，使用官方 `Daily Sleep`（包括小睡）时长，换算为小时，最多保留两位小数。
- 活动热量保存在 `record.coros.activeCaloriesKcal`，独立于 `foods[].calories`，不抵扣饮食摄入、不自动计算全天消耗或热量缺口。
- 导入保留来源日期、睡眠、活动热量和读取时间。已有来源数据默认不选中；当前睡眠有值时默认保留，覆盖必须勾选。缺失指标不会写成 0，部分成功的读取会显示警告。
- 相同日期更新来源值，不累加活动热量。预览后若睡眠或设备数据发生变化，确认会被拒绝，需重新读取。其他字段从最新记录合并保留。
- 确认后的记录使用现有账号隔离、版本检查、保存错误和重试流程；未确认预览只存在页面内存。退出或切换账号取消请求与预览。云端失败不回退本地。
- 已确认记录可以跨设备查看；COROS 授权连接仅保留在当前浏览器，另一浏览器需要独立授权。

## 授权与接口

`POST /api/coros` 接受 `status`、`connect`、`preview`、`disconnect` 操作，必须携带有效 Supabase Bearer 会话。每次调用都向 Supabase Auth 校验用户身份；本地模式不能绕过校验。

授权使用 state、PKCE S256、官方元数据发现和 OAuth 公有客户端动态注册。第三方授权凭据用 AES-256-GCM 密封在 `HttpOnly; SameSite=Lax` Cookie 中，生产环境同时设置 `Secure`。Cookie 绑定站点和已验证的 Supabase 用户 ID，明文 access/refresh token 不返回网页、不写入 localStorage 或业务表。浏览器仅携带服务端可解密的 Cookie。

MCP 只请求官方 `mcp.coros.com`、`mcpcn.coros.com`、`mcpeu.coros.com`、`mcpus.coros.com`，禁止跟随网络重定向。支持 Streamable HTTP 的 JSON / SSE 响应，固定只读工具名单、25 秒读取总超时、256 KiB 响应上限。Function 最长 60 秒，覆盖登录验证及可能的令牌刷新。所有响应均禁缓存，授权回调只返回固定结果标记。

Access token 临近过期时自动刷新。支持 Web Locks 的浏览器将跨标签页串行请求，避免同时刷新同一连接；不支持的旧浏览器建议只用一个标签页同步。断开连接清除当前浏览器的授权 Cookie，并尝试向 COROS 撤销令牌；已保存记录保留。COROS 不可用时，浏览器断开仍可完成。

基础防滥用使用固定 7 天范围和每实例按用户计数（连接最多 8 次/小时、读取最多 12 次/分钟）。这不是分布式全局配额；公开运营可另行使用部署平台的访问控制，不需要引入新的业务后端。

## 验证范围与限制

本次实现验证（2026-11-04）：245 项自动测试、ESLint、生产构建通过；浏览器隔离样例验证了窄布局、默认保留手填睡眠、重复读取默认不选中，以及明确选择后更新睡眠且不改变饮食摄入。中国大陆官方动态注册接口实测返回 201，接受公有客户端和 localhost 回调；该检查未授权或读取私人账号数据。2026-11-04 发布时已通过 Supabase SQL Editor 执行远端迁移，生产服务端 origin 和 Cookie 密钥已配置；数据库回归及线上检查结果见下方发布记录。

仓库测试覆盖模拟 OAuth、账号隔离、Cookie 篡改/过期、PKCE、刷新、错误脱敏、MCP JSON/SSE、日期/单位校验、合并/重复导入和持久化保护。执行：

```sh
npm test
npm run lint
npm run build
```

官方文档给出了睡眠文本示例，但尚未公开每日热量工具的完整响应字段契约。目前热量解析只接受明确的 `Active Calories` / `活动热量` / `活动卡路里` 标签和 kcal/千卡单位（日期分组或表格）；不会把含义不明的 `Calories`、`Total Calories` 或无单位数字当成活动热量。未知结构显示警告或错误，不会伪造成功记录。

**真实账号联调仍待完成**（按用户要求先发布当前版本）：至少核对一天睡眠和活动热量、重复同步、保留/覆盖已有睡眠、退出/切换账号、授权失效重连、云端保存后重载。如果热量提示“格式暂不支持”，需依据该账号的真实响应结构补充解析契约和测试；不要把原始健康数据或 token 写进日志或公开 issue。无真实 COROS 授权时，自动测试不能证明实际账号的数据格式兼容。

数据库回归脚本 [workspace.sql](../supabase/tests/workspace.sql) 应在测试项目应用迁移后单独执行，它覆盖 RLS、版本冲突和 COROS 字段约束。Node 测试不替代数据库执行。后续代码修改不应自动执行远端迁移、提交、推送或生产部署，需沿用用户授权的发布流程。

## 生产发布记录（2026-11-04）

- 按用户“先上线最新版”的要求，当前工作区版本（包含游客入口、邮件提示与 COROS）已发布到 [easyfitness.top](https://easyfitness.top/)。部署为 `dpl_DwJZmtoWpqzcjGqkyjFkzq4U6P9S`，版本地址为 `https://easyfitness-q2pe0v1xm-cyyue.vercel.app`，状态为 Ready。
- Supabase 已成功执行 `202611040001_coros_records.sql`。随后在事务内创建随机测试账号，验证 COROS 小数和零值保存、非法字段拒绝、手填睡眠与饮食保留、旧客户端删除来源字段被拒绝、RLS、版本冲突和匿名访问拒绝；结果为 PASS，测试账号及记录全部回滚。该次执行为针对本次迁移的回归，并非重新执行完整 `workspace.sql`。
- Production 已配置 `COROS_APP_ORIGIN=https://easyfitness.top` 与独立随机 `COROS_COOKIE_SECRET`；密钥仅由 Vercel 保存，未写入仓库、发布包或日志。未设置 `COROS_CLIENT_ID`，使用官方动态注册。
- 245 项自动测试、ESLint、本地及 Vercel 生产构建通过。线上首页和静态资源返回 200；COROS 和三个 AI 接口对有效格式的未登录请求均返回 `401 AUTH_REQUIRED`；无有效状态的 COROS 回调返回不缓存的固定错误跳转。
- 登录后的真实页面显示云端记录已加载，以及可用的“连接 COROS”按钮；没有代用户进行高驰授权或读取健康数据。授权后真实睡眠、热量格式及导入闭环仍待账号联调，不能将本次发布检查视为已经通过该部分验收。
- 主域名与三个既有 Vercel 别名均指向新版本，www 继续以 308 跳转主域名并保留查询参数。COROS 必须使用主网址，旧 Vercel 别名不满足其 origin 校验。
- 通过独立发布副本上传，保留原工作区的未提交与未跟踪内容；本次没有提交或推送 Git。上一生产部署 `dpl_AjmnoPtz2Vpk79CRQLpjrshN7o3L` 可用于回滚应用，新增迁移允许旧的无 COROS 记录继续使用。

## 官方资料

- [COROS 开发者 MCP 接入](https://support.coros.com/hc/en-us/articles/53181619102996-Build-on-COROS-MCP)
- [官方连接指南与地区端点](https://github.com/coroslab/COROS-MCP/blob/main/docs/en/getting-started.md)
- [官方工具、参数与睡眠示例](https://github.com/coroslab/COROS-MCP/blob/main/docs/en/tools.md)
- [COROS 活动热量定义](https://support.coros.com/hc/en-us/articles/4406604054932-Measuring-Active-Calories-on-COROS-Watches)
