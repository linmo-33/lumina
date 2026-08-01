# PixelForge

基于 **chatgpt2api** 的自托管 AI 生图平台。

- 用户注册 / 登录（Better Auth）
- 额度管理（注册送 10 次，管理员可充值）
- 文生图代理到 chatgpt2api
- 本地图片存储 + 图库
- 管理后台

## 技术栈

- Next.js 15 + React 19 + TypeScript
- Better Auth（SQLite）
- Drizzle ORM + better-sqlite3
- Tailwind CSS
- OpenAI SDK → chatgpt2api

## 快速开始

### 1. 安装依赖

```bash
cd pixelforge
npm install
npm install better-auth drizzle-orm better-sqlite3 openai uuid zod
npm install -D drizzle-kit @types/better-sqlite3
```

### 2. 配置环境变量

```bash
cp .env.example .env.local
```

编辑 `.env.local`：

```env
NEXT_PUBLIC_APP_URL=http://localhost:3001
BETTER_AUTH_SECRET=请改成随机长字符串
BETTER_AUTH_URL=http://localhost:3001

# 指向你的 chatgpt2api 实例
CHATGPT2API_BASE_URL=http://localhost:3000/v1
CHATGPT2API_KEY=你的auth-key
```

> 如果 chatgpt2api 也在 3000，请把 PixelForge 跑在 3001。

### 3. 初始化数据库

```bash
npx drizzle-kit push
```

### 4. 启动

```bash
npm run dev -- -p 3001
```

访问 http://localhost:3001

### 5. 创建管理员

注册账号后：

```bash
sqlite3 data/pixelforge.db "UPDATE user SET role='admin' WHERE email='你的邮箱';"
```

## 目录结构

```
src/
  app/
    (auth)/login, register
    (dashboard)/generate, gallery, admin
    api/auth, images, admin, uploads
  lib/
    auth.ts, auth-client.ts, db.ts, schema.ts, openai.ts, image-store.ts
uploads/          # 本地生成图片
data/pixelforge.db
```

## API 一览

| 方法 | 路径 | 说明 |
|------|------|------|
| * | `/api/auth/*` | Better Auth |
| POST | `/api/images/generate` | 文生图（扣额度） |
| GET | `/api/images/history` | 当前用户历史 |
| GET | `/api/admin/users` | 用户列表（admin） |
| PATCH | `/api/admin/users` | 充值额度 / 启用禁用（admin） |
| GET | `/api/uploads/...` | 本地图片访问 |

生图完全由 chatgpt2api 负责，本项目只做用户、额度、历史与转发。
