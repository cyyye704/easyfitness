# Supabase 配置与上线

本文配置邮箱登录、密码重置、按账号隔离的每日记录/档案，以及 AI 接口登录校验。以下步骤由项目维护者在自己的 Supabase 与 Vercel 项目中执行；仓库自动测试不代表远端数据库、邮件或真实 AI 已经联调成功。

## 当前项目部署记录（2026-10-28）

- 正式站点：[EasyFitness](https://easyfitness-phi.vercel.app/)。Vercel 项目为 `cyyue/easyfitness`，GitHub `main` 已连接自动部署。
- Supabase 项目为 `uvvrcwxzxesortxlqczk`，已执行 `202610280001_workspace.sql` 和 `202610280002_record_features.sql`。
- 四项 Supabase 公开配置已设置到 Vercel 的 Production、Preview、Development；既有 DeepSeek 服务端变量保留。本地 `.env.local` 已填写 Supabase 公开配置，不包含 DeepSeek Key。
- 邮箱注册、密码登录和邮箱验证已开启，匿名登录关闭。Site URL 为正式域名，三个生产别名及 localhost 的登录/密码恢复回调已加入允许列表。
- 验证通过：193 项自动测试、lint、build、模拟浏览器回归；真实数据库本人 CRUD、跨账号隔离、版本冲突与匿名访问拒绝；正式站点资源和三个 AI 接口的未登录/伪造 token 拒绝。数据库验证仅使用事务内临时测试数据，已回滚。
- 自定义 SMTP 按用户选择暂缓配置。非项目成员的注册确认和密码重置邮件暂不可视为可用；真实邮箱确认、密码恢复、登录后网页保存和有效会话的 DeepSeek 调用仍需完成实际联调。

给朋友使用前，先完成第 5 节的 SMTP 配置，再按第 8 节验证真实邮箱与账号流程。不要通过关闭邮箱验证绕过邮件配置。

### 实际使用与 SMTP 验收补记（2026-11-04）

- 2026-10-29 已完成真实邮箱注册、确认和登录；通过临时训练备注保存、刷新后读取、再清空，验证了登录后的云端保存。用户反馈登录后的 AI 草稿解析可用。
- 已在 Supabase 保存并启用 Brevo 自定义 SMTP，邮箱验证保持开启，发件人名称为 `EasyFitness`。SMTP key 只填写在 Supabase 的 SMTP Password 配置中，不写入仓库或应用环境变量。
- 从正式站点的独立 InPrivate 会话发起找回密码；2026-11-04 15:39:56（UTC+8）确认 Outlook 收到主题为 `Reset your password` 的新邮件。
- 在同一 InPrivate 会话打开该邮件链接，成功进入“设置新密码”表单，无回调错误。测试未填写或提交新密码；关闭测试窗口后，原账号仍保持登录，页面显示记录已保存到云端。
- 当前没有自有发件域名，实际发件地址被 Brevo 改写到 `brevosend.com`；邮件链接仍经 Brevo 跟踪包装。本次恢复链接可用，不代表所有邮箱投递表现均已验证。
- 尚待验证：非项目团队邮箱的新用户注册与确认，以及由用户实际提交新密码。上述结果补充并更新 2026-10-28 部署记录中的待验收状态。

### 游客模式与邮件提示发布（2026-11-04）

- 已发布到 [正式站点](https://easyfitness-phi.vercel.app/)，部署为 `dpl_AjmnoPtz2Vpk79CRQLpjrshN7o3L`，版本地址为 `https://easyfitness-nw5zs4mio-cyyue.vercel.app`。
- 发布副本基于 `43904e5`，只包含游客入口、保存后返回登录、游客 AI 限制和垃圾邮件提示；开发中的 COROS 改动保留在工作区，本次未发布，无数据库或环境变量变更。
- 发布副本通过 193 项自动测试、lint 和生产构建。发布前浏览器已验证游客保存、刷新恢复、返回登录再进入游客后记录保留。
- 发布后已确认首页和资源返回 200，新入口及邮件提示存在于正式构建，浏览器可进入游客工作区并编辑记录；未登录调用 AI 返回 `401 AUTH_REQUIRED`。线上刷新验收时电脑控制连接中断，未将该次刷新计为已验证。

### 自定义域名接入（2026-11-04）

- 主网址改为 [https://easyfitness.top/](https://easyfitness.top/)，域名在腾讯云注册，DNS 继续使用 DNSPod；绑定 Vercel 的 `cyyue/easyfitness` 项目，无应用重新部署或数据库变更。
- DNS 按 Vercel 当次验证返回的推荐值配置：`@ A 216.198.79.1`、`@ A 64.29.17.1`、`www CNAME c938f930aa024da6.vercel-dns-017.com`，默认线路，TTL 600。以后调整时以 Vercel 实时建议为准。
- 两个域名均通过 Vercel 验证并签发可自动续期的 HTTPS 证书。主网址实际返回 200；`www.easyfitness.top` 以 308 跳转主网址，并保留路径和查询参数。
- Supabase Site URL 已改为 `https://easyfitness.top/`；新增主域名和 www 各自的根地址、`/?auth=recovery` 共四条精确回调，原 Vercel 和 localhost 回调保留。保存后已重新加载确认。
- 从新域名的独立 InPrivate 会话发起找回密码，16:35:39（UTC+8）收到邮件；在同一会话打开实际邮件链接，成功进入新域名的“设置新密码”表单，无回调错误。本次未填写或提交新密码。
- 新旧网址使用同一 Supabase 项目和账号，已保存云端数据不迁移。浏览器本地记录按域名隔离，旧网址游客数据需在旧网址登录并复核导入后，才能从新网址读取。
- 本次配置网站和认证回调；Brevo 继续使用已验证的现有发件人，尚未配置新域名发信认证。

### 包含 COROS 的最新版发布（2026-11-04）

- 已发布到 [easyfitness.top](https://easyfitness.top/)，部署为 `dpl_DwJZmtoWpqzcjGqkyjFkzq4U6P9S`，版本地址为 `https://easyfitness-q2pe0v1xm-cyyue.vercel.app`。三个旧 Vercel 别名均已更新，www 保持 308 跳转。
- 已执行 COROS 迁移，并通过事务内随机账号验证字段约束、已有字段保留、账号隔离、版本冲突和匿名访问拒绝，测试数据全部回滚。Production 的 COROS 服务端 origin 与加密密钥已配置。
- 245 项自动测试、lint、本地及远端生产构建通过；线上资源、未登录接口拒绝和登录后的 COROS 入口已验证。用户要求先发布，真实 COROS 授权及健康数据导入尚未联调，详见 [COROS 发布记录](coros-setup.md)。
- 本次使用独立发布副本，没有提交、推送或清理用户工作区。

### 侧边栏与训练频次修复发布（2026-11-04）

- 用户确认发布后，已部署到 [easyfitness.top](https://easyfitness.top/)，部署为 `dpl_D3Mb4BvdGJck3QUftq8L12WH3QvB`，版本地址为 `https://easyfitness-ko5e2st9j-cyyue.vercel.app`。
- 本版包含桌面侧边栏、手机抽屉菜单、简洁首页、切换模块保留草稿、训练频次小数确认修复，以及装饰英文清理。离开手表模块会取消等待中的连接跳转。
- 无新增数据库迁移或环境变量。原有云端数据、RLS 和 COROS 服务端配置沿用；真实 COROS 账号数据联调仍按上一版记录待验证。
- 248 项测试、lint、生产构建通过；发布前完成桌面、390/320 像素手机布局、菜单关闭、站内返回保留输入、记录刷新恢复和 COROS 回调路由检查。
- 发布后首页及新版静态资源返回 200，登录状态与云端读取正常，侧边栏在“每日记录”和首页之间切换正常；COROS 与三个 AI 接口均拒绝未登录请求。www 仍以 308 跳转主域名并保留查询参数，三个旧 Vercel 别名已更新。
- 独立发布副本上传，未提交或推送 Git，用户工作区保持原样。上一部署 `dpl_DwJZmtoWpqzcjGqkyjFkzq4U6P9S` 保留用于应用回滚。

### 注册邮箱验证码方案（2026-11-04）

- 本版本新增邮箱验证码页面及 [注册确认邮件模板](../supabase/templates/confirmation.html)，已通过 261 项自动测试、ESLint、生产构建和隔离浏览器模拟验收。真实邮箱收取验证码与确认登录仍须上线后联调，模拟检查不能替代真实邮件验收。
- 后台已只读核实：Email Provider 已启用、Confirm email 已开启、邮箱 OTP 长度为 **8 位**、有效期为 **3600 秒（1 小时）**。本次保持这些设置；前端兼容 6–10 位数字验证码。
- 从不支持 `/?auth=verify` 的旧版本升级时，必须先发布验证码页面，确认该页面可访问，再紧接着切换 **Confirm sign up** 邮件模板并测试；不要提前切换邮件模板。
- 邮箱密码注册保持不变，只有注册确认改为输入验证码。密码恢复继续使用原有 PKCE 邮件链接，不修改 **Reset password** 模板。

## 1. 建立 Supabase 项目并取得公开配置

在 [Supabase Dashboard](https://supabase.com/dashboard) 新建项目，等待数据库就绪。在项目 Connect 面板或 Settings → API Keys 中取得：

- 项目根 URL，例如 `https://your-project.supabase.co`
- 新版 Publishable key，格式为 `sb_publishable_...`

不要选择 `sb_secret_...`、`service_role` 或旧式 `anon` JWT。应用只接受新版公开发布密钥；数据保护依靠用户会话和数据库 RLS，而不是隐藏这个公开 key。数据库密码也不需要填入本应用。密钥类型见 [Supabase 官方说明](https://supabase.com/docs/guides/getting-started/api-keys)。

## 2. 执行数据库迁移与 RLS

在该项目 SQL Editor 新建查询，按顺序执行完整迁移文件：

1. [202610280001_workspace.sql](../supabase/migrations/202610280001_workspace.sql)：建立数据表、RLS、版本序列和触发器。
2. [202610280002_record_features.sql](../supabase/migrations/202610280002_record_features.sql)：为每日记录增加训练状态与营养记录完整性的约束。
3. [202611040001_coros_records.sql](../supabase/migrations/202611040001_coros_records.sql)：校验可选的 COROS 睡眠和活动热量字段，并防止旧客户端更新时删除已有来源数据。连接配置见 [COROS 接入说明](coros-setup.md)。

如果项目已经成功执行早期迁移，只需按顺序补执行尚未执行的迁移，不必删表、重建项目或再次导入数据。后续新增迁移继续按 `supabase/migrations/` 文件名顺序执行，不要只建表而跳过策略或触发器。

001 创建：

| 表 | 主键 | 内容 |
| --- | --- | --- |
| `public.daily_records` | `user_id, date` | 每日记录 JSON、版本号和更新时间 |
| `public.user_profiles` | `user_id` | 正式个人档案 JSON、版本号和更新时间 |

两张表均启用 RLS；匿名角色无表权限，已登录用户仅可操作 `auth.uid()` 对应的行。版本号由数据库触发器维护，用于阻止旧设备覆盖新记录。不要为了排查前端错误关闭 RLS 或增加全表开放策略。

002 不重写旧 JSON，也不修改已有行的版本号或 RLS。缺少新字段的旧记录继续有效，前端按“训练未确认、营养未完整记录”读取。新记录的 `trainingStatus` 只接受 `unrecorded`、`trained`、`rest`；`nutritionComplete` 必须是布尔值，存在未估算饮食时不能为 `true`。食物的 `meal` 标签仍作为 JSON 字段保存，由应用校验；旧食物没有标签时按未分类读取。

执行全部迁移后，在测试项目运行 [workspace.sql](../supabase/tests/workspace.sql)，验证账号隔离、跨账号写入拒绝、版本冲突与新旧记录字段兼容。该脚本在事务里创建测试数据，结束时回滚；版本序列可能消耗编号，这是正常行为。如果已有同名表和自定义策略，先审查现有结构；迁移中的 `if not exists` 不会自动修复任意旧表或删除其他开放策略。

## 3. 开启邮箱注册、登录和验证

进入 Authentication 的 Email Provider 设置，启用邮箱与密码登录，开启允许新用户注册，并保持 Confirm email / 邮箱验证开启。不要开启匿名登录；本应用 AI 接口拒绝匿名用户。[官方邮箱密码说明](https://supabase.com/docs/guides/auth/passwords) 解释了注册与确认流程。

注册使用以下邮箱验证码流程；应用代码与邮件模板须按本节末尾的发布顺序同步切换。

1. 注册保留 `supabase.auth.signUp({ email, password })`。提交成功后停留在邮箱验证页，提示收件箱与垃圾邮件；邮箱未确认时不进入登录后的工作区。
2. 用户输入邮箱与邮件中的数字验证码，调用 `supabase.auth.verifyOtp({ email, token, type: 'email' })`。不要使用已弃用的 `verifyOtp` 类型 `signup` 或 `magiclink`；验证成功后由认证 SDK 建立登录会话。
3. 重发使用 `supabase.auth.resend({ email, type: 'signup' })`，不要重复调用 `signUp` 来重发：再次注册未确认邮箱可能修改待确认账号的密码。前端需显示重发等待时间，并处理服务端限流。
4. 用户可在任意浏览器打开 `/?auth=verify`，输入注册邮箱与验证码，无须回到发起注册的浏览器。刷新页面仅保留待验证邮箱，不保存密码或验证码；另一浏览器需重新输入邮箱。验证码和邮箱均不放进 URL。
5. 已注册邮箱的 `signUp` 可能返回错误或用于防枚举的成功结果；`resend` 对不存在或已确认的邮箱也可能返回成功而不发送邮件。提示需保持中性，不能凭成功响应断言创建了新账号或邮件已发出；已确认账号继续使用原密码登录。

验证码确认使用 `/verify` 直接提交邮箱与验证码，不依赖发起注册浏览器的 PKCE verifier。现有密码恢复仍使用 PKCE 邮件链接，必须在发起恢复的同一浏览器、同一站点环境打开；不要从 localhost 发起后在另一台设备或生产域名完成交换。已使用或过期的恢复链接需重新申请，见 [PKCE 官方说明](https://supabase.com/docs/guides/auth/sessions/pkce-flow)。

### 注册确认模板与发布顺序

在 Authentication → Email Templates → **Confirm sign up** 中使用 [confirmation.html](../supabase/templates/confirmation.html)，主题建议为 **EasyFitness 注册验证码**。模板以 `{{ .Token }}` 显示数字验证码，返回验证页的普通链接为 `{{ .SiteURL }}?auth=verify`；链接不携带验证码或邮箱，也不自动验证身份。不要在此模板加入 `{{ .ConfirmationURL }}` 或 `{{ .TokenHash }}`。不修改 **Reset password** 邮件模板或其恢复链接。模板变量说明见 [Supabase 官方邮件模板文档](https://supabase.com/docs/guides/auth/auth-email-templates)。

对应后台配置键如下；仅替换注册确认主题和内容，现有认证与 OTP 设置保持不变：

| 配置键 | 本次要求 |
| --- | --- |
| `mailer_subjects_confirmation` | `EasyFitness 注册验证码` |
| `mailer_templates_confirmation_content` | 完整粘贴 `supabase/templates/confirmation.html` |
| `external_email_enabled` | 保持已启用 |
| `mailer_autoconfirm` | 保持 `false`，即 Confirm email 开启 |
| `mailer_otp_length` | 保持已核实的 `8`；前端兼容 6–10 位数字 |
| `mailer_otp_exp` | 保持已核实的 `3600` 秒；模板相应提示 1 小时 |

`mailer_otp_exp` 也影响其他邮箱认证邮件的有效期，不能为调整注册体验顺带修改密码恢复行为。以后修改该值时，应同步修改邮件中的时长说明。配置键见 [官方 Auth 配置 API](https://supabase.com/docs/reference/api/v1-update-auth-service-config)。

发布时按以下顺序操作：

1. 先在测试环境完成第 8 节的验证码与密码恢复回归，并保留当前生产 **Confirm sign up** 模板以便回退。
2. 发布支持 `/?auth=verify` 的应用代码，确认生产验证页、邮箱输入和返回登录入口可用。
3. 紧接部署，在 Supabase 更新 **Confirm sign up** 主题及 HTML；保持 OTP 长度、有效期、Confirm email 和 **Reset password** 模板不变。
4. 使用非项目团队成员的真实邮箱完成新注册、验证码确认、登录与重发验收，再检查现有账号登录和密码恢复。记录实际结果后，才能将本节状态改为已生效。

代码上线与模板切换之间会短暂保留旧确认邮件；验收时使用切换后新发的邮件。若需回退到不支持验证码页面的旧应用，应先恢复原注册确认模板，避免继续发送只能由新版处理的验证码邮件。

注册、找回密码和重发确认后的提示均提醒检查收件箱与垃圾邮件。登录页支持“暂不登录，先使用”：游客记录保存在当前浏览器，AI 功能仍需登录；登录后通过“导入本机旧记录”复核并确认导入，不会自动上传。

## 4. 设置 Site URL 和允许的回调地址

在 Authentication → URL Configuration 设置 Site URL 为生产站点根地址，例如：

```text
https://easyfitness.example/
```

Redirect URLs 加入实际使用的站点和恢复密码地址。以下域名必须换成你自己的；本地端口以开发服务器实际输出为准：

```text
http://localhost:5173/
http://localhost:5173/?auth=recovery
http://localhost:3000/
http://localhost:3000/?auth=recovery
https://easyfitness.example/
https://easyfitness.example/?auth=recovery
```

`5173` 常用于 Vite，`3000` 常用于 `vercel dev`。如果改用 `127.0.0.1`、其他端口或 Preview 部署，也分别添加对应根 URL 和 `/?auth=recovery`。正式域名使用明确地址；不要把所有互联网域名加入允许范围。Site URL 决定默认回跳位置，允许列表控制应用提交的回调地址，见 [官方 Redirect URLs 文档](https://supabase.com/docs/guides/auth/redirect-urls)。

当前生产 Site URL 为 `https://easyfitness.top/`，注册验证码模板的返回链接将指向 `https://easyfitness.top/?auth=verify`。这是普通页面导航，不是 Supabase 认证回调，无须把验证码或邮箱加入 URL，也无须为它添加认证回调配置。Site URL 应保留根地址末尾的 `/`。

修改邮件模板时，确认没有把跳转硬编码到 localhost、旧站点或不存在的 `/auth/confirm`。注册确认模板按第 3 节显示验证码；密码恢复模板继续保留 Supabase 生成的恢复链接，并确认最终进入 `/?auth=recovery`。

## 5. 给朋友使用前配置自定义 SMTP

Supabase 默认邮件服务仅向项目团队预授权邮箱发送邮件，限制较严格，不能用于给任意朋友注册、验证和重置密码。对外使用前，在 Authentication 的 SMTP 设置中配置你自己的邮件服务主机、端口、用户名、密码和发件地址，并按服务商要求完成发件域名验证。[官方 SMTP 说明](https://supabase.com/docs/guides/auth/auth-smtp) 列出了默认限制和配置入口。

SMTP 凭证只填在 Supabase 后台，不写进前端、`.env.example` 或 Vercel 的 `VITE_` 变量。完成后用非项目团队成员的真实邮箱测试注册确认与密码恢复；还需检查垃圾箱和邮件服务的发送日志。不要为绕过投递问题而关闭邮箱验证。

## 6. 本地环境变量

复制根目录 `.env.example` 为 `.env.local`，填入实际值：

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_public_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_public_key
AI_FEATURE_ENABLED=true
DEEPSEEK_API_KEY=your_server_only_deepseek_key
DEEPSEEK_MODEL=deepseek-v4-flash
```

四个 Supabase 变量成对相同并指向同一项目：前两项用于浏览器登录/云数据，后两项用于 Function 验证 access token。只有 URL 和 publishable key 是可公开配置。`DEEPSEEK_API_KEY` 必须保持服务端变量，不需要数据库密码、SMTP 密码或 Supabase secret/service_role key。

- `npm run dev`：前端、登录和云数据；不托管 AI Function。
- `npm run dev:full`：前端与 Vercel `/api`，用于本地完整联调。
- 两个 `VITE_SUPABASE_*` 都留空：本地记录模式，原 localStorage 数据保留。
- AI 开关为 `false`：所有 AI 功能停用，手动记录与账号功能不受该开关控制。
- AI 开关为 `true` 但服务端 Supabase 未配置：返回 `AUTH_NOT_CONFIGURED`，不会跳过鉴权。

修改 `.env.local` 后重启开发服务。构建会提前检查公开配置，误填 secret/service_role 或只配置一项时会中止，不会将错误密钥打入产物。

## 7. 配置 Vercel 并重新部署

在 Vercel 项目 Settings → Environment Variables 添加上述四个 Supabase 变量，以及 `AI_FEATURE_ENABLED`、`DEEPSEEK_API_KEY`；`DEEPSEEK_MODEL` 可选。按需要选择 Production、Preview、Development，确保同一部署的浏览器与 Function 使用同一 Supabase 项目。

构建设置为 Vite、`npm run build`、输出目录 `dist`。保存环境变量后执行一次新的部署 / Redeploy；尤其 `VITE_` 变量在构建时注入，不能只改后台值而继续访问旧部署。随后检查 Supabase 的 Site URL、Redirect URLs 是否包含实际访问的域名。

`vercel.json` 已为三路 AI Function 设置 35 秒上限，覆盖最多 5 秒 Supabase 验证、25 秒 DeepSeek 请求及处理余量。登录验证失败不调用 DeepSeek；认证网络超时不会伪装成密码错误或无效 token。

## 8. 上线前实际验证

自动检查先运行 `npm test`、`npm run lint`、`npm run build`。以下项目需要在已配置的测试环境手动确认，不能用 mock 通过代替：

1. 用非项目团队成员的新邮箱提交邮箱与密码注册；页面应停留在验证码表单，显示待验证邮箱及垃圾邮件提示，未确认前不能进入已登录工作区。确认邮件显示当前配置的 8 位数字码与 1 小时有效期，不含自动确认链接。点击“返回邮箱验证页”只能打开表单，不能直接登录。
2. 刷新验证页应保留待验证邮箱，密码与验证码不持久化。等待重发倒计时结束后申请新邮件，使用最新收到的验证码完成确认；快速重复点击、服务端限流及发送失败均应有明确提示，不重复创建账号。
3. 错误验证码、过期验证码和已使用验证码均应被拒绝，仍可修改邮箱、重试或重发；不要为测试过期而修改生产的全局有效期。确认成功后建立登录会话，退出后可用注册时的密码重新登录，错误密码被拒绝。
4. 在浏览器 A 注册，在浏览器 B 直接打开 `https://easyfitness.top/?auth=verify`，手动输入同一邮箱及验证码；应能确认并在 B 登录，URL 中无邮箱或验证码。浏览器 A 不应因 B 的验证而显示虚假的本地登录状态。
5. 已确认的旧账号可正常密码登录；对旧账号再次注册或重发时提示保持中性，不把成功响应当作一定发信。未确认账号使用重发按钮后原密码保持不变。
6. 密码恢复回归：在同一浏览器申请并打开原有恢复邮件，进入“设置新密码”表单，由测试账号实际提交新密码；新密码可登录、旧密码被拒绝。确认 **Reset password** 模板未改为注册验证码模板，跨浏览器或过期恢复链接仍给出重新申请提示。
7. 账号 A 新增记录、档案后刷新，并在另一个浏览器登录 A 检查已保存数据；账号 B 不能读取或修改 A 的数据。
8. 退出、切换账号时确认页面和个人引导草稿隔离；保存失败要有提示，不能显示为同步成功。
9. 浏览器已有旧本地数据时，未点击确认前不能上传；同日/档案冲突默认保留云端，明确选择覆盖才更新。
10. 两个设备同时编辑同一天，后保存的旧版本应被提示冲突；重新加载再处理，不能静默覆盖。
11. 未登录或伪造 token 请求 AI 应被拒绝；正常登录后仅在用户点击整理时调用 DeepSeek，草稿确认前不写正式记录。
12. 测试环境验证完成后再决定是否发布生产环境；生产按第 3 节先发布代码、再切换模板并验收。本指南及新增 HTML 模板本身不代表验证码流程已上线、模板已生效或实际投递与跨浏览器确认已验证。

## 常见问题

| 现象 | 优先检查 |
| --- | --- |
| 页面仍是本地模式 | 两个 `VITE_SUPABASE_*` 是否为空；修改后是否重新构建/部署 |
| 提示公开配置不完整 | URL 和 `sb_publishable_` key 是否成对配置，URL 是否为项目根地址 |
| 登录成功但记录加载失败 | 是否执行完整迁移、表/RLS 是否存在、前端项目是否正确 |
| 收不到确认/恢复邮件 | 是否配置自定义 SMTP、地址是否被默认服务限制、发件域名验证及垃圾箱 |
| 邮件跳到 localhost 或没有密码表单 | Site URL、允许列表和模板；恢复 URL 应为 `/?auth=recovery` |
| 注册验证码无效或过期 | 邮箱是否一致、是否使用最新邮件中的数字码、是否已使用或超过 1 小时；重新申请验证码 |
| 注册邮件仍只有确认链接 | 支持验证码的代码是否已发布，Confirm sign up 模板是否已切换；切换后重新申请邮件 |
| 返回邮箱验证页后没有验证码表单 | 应用是否已发布支持 `/?auth=verify` 的版本、Site URL 是否为正确根地址 |
| 密码恢复回调提示无效或过期 | 是否在发起恢复的同一浏览器打开、是否已点击过；重新请求恢复邮件 |
| `AUTH_NOT_CONFIGURED` | Vercel 服务端两项 `SUPABASE_*` 是否完整且使用公开 key |
| `AUTH_REQUIRED` | 会话是否过期、前后端是否指向同一 Supabase 项目；重新登录 |
| `AUTH_UNAVAILABLE` | Supabase 服务或网络是否可达，稍后重试；不要据此直接清除用户数据 |
| `AI_NOT_CONFIGURED` / `AI_DISABLED` | 服务端 DeepSeek Key、AI 开关和环境变量作用域 |
