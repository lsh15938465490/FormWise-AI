# FormWise-AI Frontend

React 18 + TypeScript + Vite。状态用 Zustand，动态表单走插件注册中心，流程画布用 React Flow。

## 架构

```
src/
  app-router.tsx          # 路由与登录守卫
  lib/api.ts              # 统一 API 客户端
  stores/                 # 鉴权 / 表单搭建 / 通知
  plugins/                # 表单组件与流程节点注册
  components/
    layout/               # 工作台壳层
    form-engine/          # JSON Schema 动态渲染
    ui/                   # 基础 UI
  pages/                  # 业务页面
```

## 启动

需先启动后端 `http://localhost:8002`。

```bash
cd frontend
npm install
npm run dev
```

浏览器打开 http://localhost:5175 ，演示账号 `admin@formwise.local` / `Admin123!`。

已实现：AI 表单生成与字段微调、Zod 校验提交、流程拖拽编排、动态 CRUD、待办审批、消息中心、RBAC 配置、插件注册。

