# EasyFitness

EasyFitness 是一个纯前端的饮食与训练记录小工具，使用 Vite + React + TypeScript 构建。

当前版本定位为移动端优先的 MVP：记录每天的体重、饮食、训练和睡眠，并根据简单规则给出当天状态评价。

## 功能

- 今日记录表单：体重、训练、睡眠
- 饮食记录：新增和删除食物
- 食物字段：食物名、热量、蛋白质
- 自动汇总：当天总热量、总蛋白质
- 当天评价：加分 / 持平 / 扣分
- 历史记录列表：按日期查看已有记录
- 减脂通识知识模块
- 本地保存：使用 localStorage

## 技术栈

- Vite
- React
- TypeScript
- CSS
- localStorage

## 数据说明

项目不包含后端、登录、数据库或云同步。所有记录只保存在浏览器本地。

localStorage key：

```text
easyfitness.records.v1
```

清除浏览器站点数据会删除本地记录。

## 开发命令

安装依赖：

```bash
npm install
```

启动开发服务器：

```bash
npm run dev
```

代码检查：

```bash
npm run lint
```

运行测试：

```bash
npm test
```

生产构建：

```bash
npm run build
```

## 当前范围

当前阶段只做纯前端 MVP：

- 不做后端
- 不调用外部 API
- 不做账号登录
- 不做云端同步
- 不做数据库
- 不做复杂图表
- 不做 AI 自动分析

## 项目结构

```text
src/
  components/        页面组件
  App.tsx            应用入口组件
  App.css            应用样式
  index.css          全局样式变量
  knowledge.ts       减脂通识内容
  storage.ts         localStorage 读写
  types.ts           TypeScript 类型
  utils.ts           汇总、评价、日期等工具函数
```
