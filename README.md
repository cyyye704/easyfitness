# EasyFitness

EasyFitness 是一个移动端优先的饮食、训练、恢复与个人基线记录工具，使用 Vite、React 和 TypeScript 构建。正式记录和个人档案保存在浏览器 `localStorage`；可选的 DeepSeek 服务只负责把自然语言整理成待确认草稿。

## 当前功能

- 记录每日体重、睡眠和训练
- 手动新增、删除饮食，自动汇总热量和蛋白质
- 按简单规则显示“加分 / 持平 / 扣分”评价
- 按日期查看历史记录
- 减脂通识课程
- 自然语言 AI 记录：解析、编辑、处理冲突、确认后写入
- 个人身体基线：首次自然语言描述、最多五个固定补充问题、完整复核后本地保存
- 本地身体模型：读取最新每日体重，计算 BMI 参考值与可解释的模型层级
- 已完成档案支持直接编辑和独立清除，不影响每日记录
- 未估算饮食与最近 7 天、30 天或自定义周期的阶段总结
- 黑红视觉系统与健身房、跑道、球场背景渐变

## AI 记录的数据流

```text
浏览器自然语言
  -> POST /api/ai/parse-daily-log
  -> Vercel Function 校验输入
  -> DeepSeek 返回结构化原始数据
  -> Function 校验、固定目标日期、生成草稿 ID 与建议值
  -> 浏览器显示可编辑草稿
  -> 用户确认
  -> updateRecord -> storage.ts -> localStorage
```

DeepSeek 不直接修改正式记录。草稿在用户确认前不会进入 `DailyRecord`；正式记录不会发送到服务端保存，也没有数据库、账号或云同步。

## 个人身体基线

首次访问且当前浏览器没有已完成档案时，页面默认显示个人基线引导，也允许暂时跳过。流程为：

```text
自然语言个人描述
  -> POST /api/ai/parse-profile
  -> DeepSeek 返回结构化候选事实
  -> 服务端运行时校验并返回草稿
  -> 浏览器固定问题引擎最多补充 5 题
  -> 用户完整复核和编辑
  -> 确认后写入 easyfitness.profile.v1
  -> 浏览器根据档案和每日记录实时计算 BodyModel
```

DeepSeek 只参与第一次自然语言解析，后续固定问题不会再次调用 AI。引导中途使用 `easyfitness.profile-draft.v1` 保存进度，刷新后可以继续；正式保存后草稿会被删除。

第一版身体模型只整理个人事实、优先读取最新每日体重、计算 BMI 参考值，并显示“信息待补充 / 基础模型 / 可用模型 / 增强模型”。它不进行医疗诊断，不估算疾病风险，不生成 BMR/TDEE、个体化热量、蛋白质或训练饮食计划，也不改变现有每日评分。

## 技术栈

- Vite 8
- React 19
- TypeScript 6
- Vercel Functions（Web `Request` / `Response`）
- DeepSeek Chat Completions API
- CSS
- localStorage

## 本地开发

安装依赖：

```bash
npm install
```

复制环境变量示例为 `.env.local`，然后填写你自己的服务端 DeepSeek Key：

```text
AI_FEATURE_ENABLED=true
DEEPSEEK_API_KEY=你的密钥
```

不要给密钥加 `VITE_` 前缀。Vite 会把 `VITE_` 变量暴露给浏览器；本项目的 Key 只能由 Function 读取。`.env.local` 与 `.vercel` 已被 Git 忽略。

启动包含前端和 `/api` Function 的完整本地环境：

```bash
npm run dev:full
```

首次运行 Vercel CLI 可能要求登录并创建或关联一个 Vercel 项目。

如果项目已经存在于 Vercel，也可以先拉取 Development 环境变量：

```bash
vercel link
vercel env pull .env.local
npm run dev:full
```

仅调试不需要 AI 的前端界面时，可运行：

```bash
npm run dev
```

普通 Vite 开发服务器不托管 `/api`，因此该模式下点击自然语言整理功能会失败，这是预期行为。

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `AI_FEATURE_ENABLED` | 是 | 必须为 `true` 才启用接口；其他值返回 `AI_DISABLED` |
| `DEEPSEEK_API_KEY` | 是 | 仅服务端使用的 DeepSeek API Key |
| `DEEPSEEK_MODEL` | 否 | 默认 `deepseek-v4-flash` |

不要把真实密钥写入源码、提交记录、浏览器存储、截图或日志。

## 检查与构建

```bash
npm test
npm run lint
npm run build
```

测试是纯函数与本地 Request 测试，不访问网络，也不需要 API Key。生产构建会同时类型检查 `src` 和 `api/**/*.ts`。

## 部署到 Vercel

1. 将仓库导入 Vercel，并保持 Framework Preset 为 Vite、Build Command 为 `npm run build`、Output Directory 为 `dist`。
2. 在 Vercel 项目的 Environment Variables 中添加 `AI_FEATURE_ENABLED=true` 和 `DEEPSEEK_API_KEY`；如果要换模型，再添加 `DEEPSEEK_MODEL`。
3. 分别确认 Production、Preview、Development 环境是否需要这些变量。
4. 先创建 Preview 部署，验证手动记录、背景切换和 AI 草稿确认流程。
5. 验证通过后再由项目维护者决定是否发布 Production。

仓库中的 `vercel.json` 将 AI Function 的最长执行时间设为 30 秒；应用内部总超时为 25 秒，最多只对允许重试的上游异常重试一次。

本说明不代表已经执行部署。任何提交、推送、Preview 或 Production 部署都需要显式操作。

## 数据与隐私

- 每日正式记录使用 localStorage key：`easyfitness.records.v1`
- 正式个人档案使用 localStorage key：`easyfitness.profile.v1`
- 未完成个人档案草稿使用 localStorage key：`easyfitness.profile-draft.v1`
- 三个 key 相互独立；清除个人档案不会删除每日记录
- 清除浏览器站点数据会删除每日记录、个人档案和未完成草稿；换浏览器或设备不会自动同步
- 每日自然语言和首次个人描述会经过 Vercel Function 发送给 DeepSeek；确认后的正式档案不会在服务端持久化
- API 响应使用 `Cache-Control: no-store`
- 服务端日志只记录请求 ID、耗时、错误类别、上游状态码、是否重试和安全功能标识，不记录身体描述、正式档案、输入文字、提示词或密钥
- 当前没有生产级账号限流；不能把单实例内存计数器当成可靠限流。若公开开放服务，应在平台网关增加正式的速率限制和滥用防护
- 建议在 DeepSeek 账户中设置消费预警或额度上限

无账号公开 MVP 无法仅靠应用内存实现严格的全局限流。正式公开推广前需要结合 Vercel Firewall、外部限流存储、验证码或用户鉴权进一步防滥用。

## 合并规则

- AI 食物按草稿顺序追加在当天已有食物之前，已有食物不删除
- 确认时为食物生成正式 ID，不复用草稿 ID
- 训练在已有内容后换行追加；完全相同则不重复
- 已有体重和睡眠默认保留，只有用户明确选择后才替换
- 空白食物或热量、蛋白质最终值都无效的食物会被忽略
- 当前记录日期始终优先，模型或过期草稿不能改写其他日期

## 项目结构

```text
api/
  ai/parse-daily-log.ts  每日自然语言 Vercel Function
  ai/parse-profile.ts    个人基线自然语言 Vercel Function
  ai/summarize-period.ts 阶段文字总结 Vercel Function
  _lib/                  HTTP 校验、DeepSeek 客户端与提示词
src/
  ai/                    AI 类型、前端请求、校验与合并逻辑
  profile/               档案类型、校验、存储、问题引擎和 BodyModel
  periodSummary/         本地阶段聚合、校验与请求客户端
  components/            页面、引导、自然语言输入与草稿检查组件
  App.tsx                每日记录和个人档案的上层状态接入
  App.css                页面和组件样式
  index.css              全局视觉变量
  knowledge.ts           减脂通识内容
  storage.ts             localStorage 读写
  types.ts               正式业务类型
  utils.ts               汇总、评价、日期等工具函数
tests/                   无网络自动化测试
```

## 当前边界

- 不做账号、登录、鉴权和多用户系统
- 不做数据库、云同步或服务端正式记录持久化
- 不做复杂图表、社交功能或多轮 AI 对话
- 不允许 AI 未经确认自动保存
- 不进行医疗诊断、体脂猜测或个体化热量与蛋白质目标
- BMI 只是身高体重参考，不等于体脂率或医学诊断
- 每日“加分 / 持平 / 扣分”仍是通用规则，尚未按个人档案个体化
