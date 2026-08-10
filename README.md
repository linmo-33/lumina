# Lumina

Lumina 是一个自托管 AI 图像生成平台，通过兼容 OpenAI Images API 的
[chatgpt2api](https://github.com/basketikun/chatgpt2api) 提供图像生成能力。

项目提供从首次部署、账号认证到创作、作品管理和运营后台的一体化 Web 界面，适合个人或小型团队在自己的服务器上部署。

## 功能

- 邮箱密码注册、Resend 验证码认证、登录、密码找回与会话管理
- 首次部署向导和首位管理员创建
- 文生图、批量生成及多种尺寸与质量选项
- 支持 `gpt-image-2`
- 本地保存生成结果和个人历史图库
- 按生成张数扣减用户额度
- 用户启用、封禁及额度调整
- 管理员配置模型、尺寸、质量、提示词长度和新用户默认额度
- 额度变更记录和管理员操作审计
- SQLite 自动迁移，无需手动初始化数据库
- Docker、Docker Compose 和 GitHub Container Registry 部署

## 技术栈

- Next.js 16 App Router、React 18、TypeScript
- shadcn/ui、Base UI、Tailwind CSS 4
- Better Auth
- Resend
- Drizzle ORM、better-sqlite3
- OpenAI SDK
- pnpm

## 工作方式

```text
浏览器
  │
  ▼
Lumina ─────────► chatgpt2api /v1/images/generations
  │
  ├── data/app.db    用户、额度、配置和历史记录
  └── uploads/       生成的图片文件
```

Lumina 不直接提供图像模型服务。部署前需要准备一个可访问的 `chatgpt2api` 实例及对应密钥。

## 使用 Docker Compose 部署

### 1. 获取项目

```bash
git clone https://github.com/linmo-33/lumina.git
cd lumina

# 创建目录
mkdir -p data uploads
sudo chown -R 1001:1001 data uploads
sudo chmod 750 data uploads
```

### 2. 配置环境变量

复制示例配置：

```bash
cp .env.example .env
```

PowerShell 可使用：

```powershell
Copy-Item .env.example .env
```

编辑 `.env`：

```env
BETTER_AUTH_URL=https://lumina.example.com
BETTER_AUTH_SECRET=请替换为至少32位的随机字符串
LUMINA_CONFIG_ENCRYPTION_KEY=请替换为至少32位的随机字符串
RESEND_API_KEY=re_请替换为真实密钥
RESEND_FROM_EMAIL=Lumina <noreply@your-verified-domain.example>
TZ=Asia/Shanghai
```

配置说明：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `BETTER_AUTH_URL` | 是 | Lumina 的外部访问地址，本地部署可使用 `http://localhost:3000` |
| `BETTER_AUTH_SECRET` | 是 | Better Auth 签名密钥，至少 32 位，生产环境必须使用随机值 |
| `LUMINA_CONFIG_ENCRYPTION_KEY` | 否 | 后台供应商 API Key 的加密主密钥，建议配置独立的至少 32 位随机值；未配置时使用 `BETTER_AUTH_SECRET` 派生 |
| `RESEND_API_KEY` | 是 | Resend API 密钥，仅在服务端用于发送邮箱验证码和密码重置链接 |
| `RESEND_FROM_EMAIL` | 是 | 邮件发件人，域名必须已在 Resend 中完成验证，可填写 `Lumina <noreply@example.com>` 格式 |
| `TZ` | 否 | 每日灵点补给的重置时区，Docker 镜像默认为 `Asia/Shanghai` |

不要提交 `.env` 或任何真实密钥。完成首次管理员初始化后，进入后台“系统配置”保存 OpenAI 兼容供应商地址和 API Key，并点击“获取上游模型”。容器内的 `localhost` 指向 Lumina 容器自身，因此上游服务部署在其他容器或主机时，应填写它在容器网络中可访问的地址。

旧版部署仍可通过 `CHATGPT2API_BASE_URL` 和 `CHATGPT2API_KEY` 作为临时回退配置；一旦在后台保存供应商，数据库配置优先。后台只显示 API Key 掩码，不会回显密钥。

### 3. 启动服务

```bash
docker compose up -d
```

Compose 默认执行以下操作：

- 拉取 `ghcr.io/linmo-33/lumina:latest`
- 将服务暴露在 `http://localhost:3000`
- 将 `./data` 挂载到 `/app/data`
- 将 `./uploads` 挂载到 `/app/uploads`
- 容器异常退出后自动重启

如果 GHCR 镜像被设置为私有，需要先登录：

```bash
docker login ghcr.io
```

### 4. 完成首次设置

打开 `http://localhost:3000`。应用会自动进入 `/setup`，检查数据库、认证和邮件环境变量，然后引导创建首位管理员。生图供应商在管理员登录后台后配置。

首位管理员创建成功后，初始化入口会自动锁定。后续注册用户必须完成邮箱验证码认证，默认额度可在管理后台修改。验证码 10 分钟内有效，同一地址每分钟最多请求 3 次。

### 更新镜像

```bash
docker compose pull
docker compose up -d
```

应用启动时会自动执行版本化数据库迁移。生产环境不需要运行 `pnpm db:push`，也不要通过删除数据库解决迁移问题。

### 停止服务

```bash
docker compose down
```

该命令不会删除绑定挂载的 `data/` 和 `uploads/`。升级或迁移前建议备份这两个目录。

## 本地开发

建议使用 Node.js 22 和 pnpm。推荐通过 Corepack 启用 pnpm：

```bash
corepack enable
pnpm install
```

复制并填写环境变量后启动开发服务器：

```bash
cp .env.example .env
pnpm dev
```

访问 `http://localhost:3000` 并通过首次部署向导创建管理员。

常用命令：

```bash
pnpm dev        # 启动开发服务器
pnpm lint       # 执行 ESLint
pnpm build      # 生产构建和 TypeScript 检查
pnpm db:studio  # 打开 Drizzle Studio
```

## 数据与持久化

| 路径 | 内容 | 是否应提交 Git |
| --- | --- | --- |
| `data/app.db` | SQLite 数据库 | 否 |
| `uploads/` | 用户生成的图片 | 否 |
| `.env` | 真实环境变量和密钥 | 否 |
| `.env.example` | 环境变量示例 | 是 |

数据库和图片是完整运行数据。部署迁移时需要同时复制 `data/` 与 `uploads/`，并确保运行用户具有写入权限。

## 管理后台

管理员登录后可以：

- 查看用户、额度和使用概况
- 增减用户额度并查看变更记录
- 启用或封禁账号
- 设置默认模型和允许使用的模型
- 设置默认尺寸、质量及其可选范围
- 限制单次生成数量和提示词长度
- 设置新注册用户的默认额度
- 配置 OpenAI 兼容生图供应商并加密保存 API Key
- 从供应商 `/models` 接口同步模型，选择可用模型和默认模型
- 查看管理员操作审计

认证密钥和邮件服务仍通过服务器环境变量管理。生图供应商地址和 API Key 通过后台配置，API Key 在数据库中加密保存，管理后台只显示掩码，不会回显明文。

## 项目结构

```text
src/app/                    Next.js 页面和 Route Handlers
src/app/setup/              首次部署向导
src/app/(auth)/             登录与注册页面
src/app/(dashboard)/        创作、图库和管理后台
src/app/api/                认证、设置、图片和管理 API
src/components/             公共界面组件
src/lib/schema.ts           Drizzle 表结构
src/lib/migrations.ts       SQLite 版本化迁移
src/lib/openai.ts           生图客户端入口
src/lib/model-provider.ts   OpenAI 兼容供应商、密钥加密和上游模型同步
src/lib/email.ts            Resend 邮件发送服务
src/lib/email-templates/    验证码和密码重置邮件内容模板
src/lib/image-store.ts      本地图片存储
data/                       运行时数据库目录
uploads/                    运行时图片目录
Dockerfile                  生产镜像构建入口
docker-compose.yml          Compose 部署配置
```


## 安全建议

- 生产环境使用 HTTPS，并将 `BETTER_AUTH_URL` 设置为实际外部地址。
- 使用独立、随机且不少于 32 位的 `BETTER_AUTH_SECRET`。
- 不要把 Lumina、SQLite 数据库或 chatgpt2api 密钥暴露给不可信网络。
- 定期备份 `data/` 与 `uploads/`。
- 通过反向代理限制请求大小、超时和访问频率。

## 许可证

Lumina 项目代码采用 [MIT License](./LICENSE)。部署或分发前请同时确认所使用第三方依赖的许可条件。
