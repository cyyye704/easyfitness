# Supabase 配置与上线

本文配置邮箱登录、密码重置、按账号隔离的每日记录/档案，以及 AI 接口登录校验。以下步骤由项目维护者在自己的 Supabase 与 Vercel 项目中执行；仓库自动测试不代表远端数据库、邮件或真实 AI 已经联调成功。

## 1. 建立 Supabase 项目并取得公开配置

在 [Supabase Dashboard](https://supabase.com/dashboard) 新建项目，等待数据库就绪。在项目 Connect 面板或 Settings → API Keys 中取得：

- 项目根 URL，例如 `https://your-project.supabase.co`
- 新版 Publishable key，格式为 `sb_publishable_...`

不要选择 `sb_secret_...`、`service_role` 或旧式 `anon` JWT。应用只接受新版公开发布密钥；数据保护依靠用户会话和数据库 RLS，而不是隐藏这个公开 key。数据库密码也不需要填入本应用。密钥类型见 [Supabase 官方说明](https://supabase.com/docs/guides/getting-started/api-keys)。

## 2. 执行数据库迁移与 RLS

在该项目 SQL Editor 新建查询，按顺序执行完整迁移文件：

1. [202610280001_workspace.sql](../supabase/migrations/202610280001_workspace.sql)：建立数据表、RLS、版本序列和触发器。
2. [202610280002_record_features.sql](../supabase/migrations/202610280002_record_features.sql)：为每日记录增加训练状态与营养记录完整性的约束。

如果项目已经成功执行 001，本次只需补执行 002，不必删表、重建项目或再次导入数据。后续新增迁移继续按 `supabase/migrations/` 文件名顺序执行，不要只建表而跳过策略或触发器。

001 创建：

| 表 | 主键 | 内容 |
| --- | --- | --- |
| `public.daily_records` | `user_id, date` | 每日记录 JSON、版本号和更新时间 |
| `public.user_profiles` | `user_id` | 正式个人档案 JSON、版本号和更新时间 |

两张表均启用 RLS；匿名角色无表权限，已登录用户仅可操作 `auth.uid()` 对应的行。版本号由数据库触发器维护，用于阻止旧设备覆盖新记录。不要为了排查前端错误关闭 RLS 或增加全表开放策略。

002 不重写旧 JSON，也不修改已有行的版本号或 RLS。缺少新字段的旧记录继续有效，前端按“训练未确认、营养未完整记录”读取。新记录的 `trainingStatus` 只接受 `unrecorded`、`trained`、`rest`；`nutritionComplete` 必须是布尔值，存在未估算饮食时不能为 `true`。食物的 `meal` 标签仍作为 JSON 字段保存，由应用校验；旧食物没有标签时按未分类读取。

执行两个迁移后，在测试项目运行 [workspace.sql](../supabase/tests/workspace.sql)，验证账号隔离、跨账号写入拒绝、版本冲突与新旧记录字段兼容。该脚本在事务里创建测试数据，结束时回滚；版本序列可能消耗编号，这是正常行为。如果已有同名表和自定义策略，先审查现有结构；迁移中的 `if not exists` 不会自动修复任意旧表或删除其他开放策略。

## 3. 开启邮箱注册、登录和验证

进入 Authentication 的 Email Provider 设置，启用邮箱与密码登录，开启允许新用户注册，并保持 Confirm email / 邮箱验证开启。不要开启匿名登录；本应用 AI 接口拒绝匿名用户。[官方邮箱密码说明](https://supabase.com/docs/guides/auth/passwords) 解释了注册与确认流程。

注册成功后，用户需要点击确认邮件；忘记密码通过邮件进入应用中的新密码表单。默认邮件模板保留 `{{ .ConfirmationURL }}` 链接即可，本项目不提供 `/auth/confirm` 服务端路由，不要直接套用其他框架的回调模板。

本应用使用 PKCE。确认和重置链接应在发起流程的同一浏览器、同一站点环境打开；不要从 localhost 发起后在另一台设备或生产域名完成交换。跨浏览器、已使用或过期的链接可能需要重新发起流程，见 [PKCE 官方说明](https://supabase.com/docs/guides/auth/sessions/pkce-flow)。

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

修改过邮件模板时，确认没有把跳转硬编码到 localhost、旧站点或不存在的 `/auth/confirm`；保留 Supabase 生成的确认链接，并确认密码恢复最终带有 `auth=recovery`。

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

1. 用两个邮箱各自注册、收到确认邮件并登录；确认错误密码被拒绝，恢复邮件能进入修改密码表单。
2. 账号 A 新增记录、档案后刷新，并在另一个浏览器登录 A 检查已保存数据；账号 B 不能读取或修改 A 的数据。
3. 退出、切换账号时确认页面和个人引导草稿隔离；保存失败要有提示，不能显示为同步成功。
4. 浏览器已有旧本地数据时，未点击确认前不能上传；同日/档案冲突默认保留云端，明确选择覆盖才更新。
5. 两个设备同时编辑同一天，后保存的旧版本应被提示冲突；重新加载再处理，不能静默覆盖。
6. 未登录或伪造 token 请求 AI 应被拒绝；正常登录后仅在用户点击整理时调用 DeepSeek，草稿确认前不写正式记录。
7. 验证完成后再决定是否发布生产环境。本指南本身不代表项目、SMTP、SQL 或真实 AI 调用已经配置成功。

## 常见问题

| 现象 | 优先检查 |
| --- | --- |
| 页面仍是本地模式 | 两个 `VITE_SUPABASE_*` 是否为空；修改后是否重新构建/部署 |
| 提示公开配置不完整 | URL 和 `sb_publishable_` key 是否成对配置，URL 是否为项目根地址 |
| 登录成功但记录加载失败 | 是否执行完整迁移、表/RLS 是否存在、前端项目是否正确 |
| 收不到确认/恢复邮件 | 是否配置自定义 SMTP、地址是否被默认服务限制、发件域名验证及垃圾箱 |
| 邮件跳到 localhost 或没有密码表单 | Site URL、允许列表和模板；恢复 URL 应为 `/?auth=recovery` |
| 回调提示无效或过期 | 是否在发起流程的同一浏览器打开、是否已点击过；重新请求邮件 |
| `AUTH_NOT_CONFIGURED` | Vercel 服务端两项 `SUPABASE_*` 是否完整且使用公开 key |
| `AUTH_REQUIRED` | 会话是否过期、前后端是否指向同一 Supabase 项目；重新登录 |
| `AUTH_UNAVAILABLE` | Supabase 服务或网络是否可达，稍后重试；不要据此直接清除用户数据 |
| `AI_NOT_CONFIGURED` / `AI_DISABLED` | 服务端 DeepSeek Key、AI 开关和环境变量作用域 |
