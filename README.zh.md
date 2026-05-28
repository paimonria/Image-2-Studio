# Image-2 Studio 中文文档

Image-2 Studio 是一个多用户、聊天式交互的 AI 生图工作台。项目支持 OpenAI `gpt-image-2` 和 OpenAI-compatible 第三方网关。

## 功能特性

- 多用户账号登录和注册。
- 管理员面板：用户管理、注册开关、平台供应商配置、平台额度、用量和最近历史。
- 每个用户独立保存 API key、历史记录和图片文件。
- 用户 API key 优先，平台 API key 作为 fallback。
- API key 使用 `APP_SECRET` 加密保存。
- OpenAI-compatible 图像模型在网关支持时可用于文生图、图生图和继续编辑。
- 类似 playground 的生图工作台：明亮液态玻璃界面、顶部历史搜索、底部输入器和可收起的生成参数抽屉。
- 历史记录支持搜索筛选、收藏、多选、复制链接、下载和继续编辑。
- 上传图和生成图保存在 `storage/`，并通过受保护接口访问。

## 本地开发

本地开发使用 SQLite。

```powershell
pnpm.cmd install
copy .env.example .env.local
pnpm.cmd run db:sqlite
pnpm.cmd run db:push
pnpm.cmd dev
```

打开：

```text
http://localhost:3000
```

本地至少配置：

```env
DATABASE_URL=file:./dev.db
APP_SECRET=replace-with-at-least-32-random-characters
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=replace-with-a-strong-admin-password
```

如果 API 路由报 Prisma `P2022`，例如缺少 `AppSetting.siteTitle` 字段，先同步本地 SQLite 表结构，再重启开发服务：

```powershell
pnpm.cmd run db:push
pnpm.cmd run db:generate
pnpm.cmd dev
```

Windows 本地构建默认不会输出 `.next/standalone`，日常验证直接运行：

```powershell
pnpm.cmd run build
```

Docker 镜像构建仍然会生成 standalone Next.js 服务，因为 `Dockerfile` 会在 `pnpm build` 前设置 `NEXT_STANDALONE=true`。如果你需要在 Docker 外手动生成 standalone，可以运行：

```powershell
$env:NEXT_STANDALONE="true"; pnpm.cmd run build
```

使用 pnpm 在 Windows 上生成 standalone 时，Next.js 复制 traced dependencies 会用到 symlink，可能需要开启开发者模式或使用管理员 PowerShell。

## Docker 部署：服务器只拉取镜像

生产部署只使用 GHCR 上已经构建好的镜像。服务器只负责拉取和启动镜像；依赖安装和镜像构建都在镜像到达服务器之前完成。

镜像发布按用途拆开：

- 日常开发使用 `pnpm.cmd run publish:dev` 从本地触发 GitHub Actions，只推送 `dev-latest` 和 `dev-<short-sha>`。
- 生产环境继续拉取 `latest`。
- `latest` 由推送 `v*` tag 的正式发布流程自动更新。

```text
ghcr.io/paimonria/image-2-studio:dev-latest
ghcr.io/paimonria/image-2-studio:dev-<short-sha>
ghcr.io/paimonria/image-2-studio:<version-tag>
ghcr.io/paimonria/image-2-studio:latest
```

### 1. 获取部署文件

克隆仓库只是为了拿到 Compose 文件和 `.env.example`，服务器不会构建源码。

```bash
git clone https://github.com/paimonria/Image-2-Studio.git
cd Image-2-Studio
```

### 2. 配置 `.env`

```bash
cp .env.example .env
nano .env
```

使用默认内置 PostgreSQL 和 Redis 栈时至少修改：

```env
IMAGE_NAME=ghcr.io/paimonria/image-2-studio
IMAGE_TAG=latest
APP_PORT=3000
POSTGRES_PASSWORD=replace-with-a-strong-postgres-password
APP_SECRET=replace-with-at-least-32-random-characters
INITIAL_ADMIN_EMAIL=admin@your-domain.com
INITIAL_ADMIN_PASSWORD=replace-with-a-strong-admin-password
```

生成 `APP_SECRET`：

```bash
openssl rand -hex 32
```

可选平台供应商配置：

```env
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_IMAGE_MODEL=
```

每个应用容器内的生图任务并发上限：

```env
IMAGE_JOB_CONCURRENCY=2
IMAGE_JOB_USER_CONCURRENCY=1
```

默认容器并发是 `2`。建议先观察 `/api/health` 里的任务队列指标、内存、CPU、PostgreSQL 连接数和上游网关延迟，再逐步调到 `4`、`6`，最多建议 `8`。`IMAGE_JOB_USER_CONCURRENCY` 用于限制单个用户在单容器内可占用的槽位，默认是容器并发的一半向上取整。如果上游网关较慢、文件存储压力大或服务器内存紧张，请调低这些值；多容器部署时总并发约等于容器数乘以容器并发值。

默认 `docker-compose.yml` 已经包含 Redis 和一个 worker 容器。如果要使用外部 Redis 服务商，在 `.env` 设置 `REDIS_URL`；同一个值会传给 Web 和 Worker：

```env
REDIS_URL=redis://:password@redis.example.com:6379/0
# 如果 Redis 服务商要求 TLS，使用 rediss://:password@redis.example.com:6380/0
IMAGE_QUEUE_PREFIX=image2
IMAGE_WORKER_CONCURRENCY=4
IMAGE_QUEUE_ATTEMPTS=3
IMAGE_QUEUE_BACKOFF_MS=5000
WORKER_DATABASE_CONNECTION_LIMIT=5
```

启用 Redis 后，Web 容器只把生图任务写入 BullMQ 队列，不在 Web 进程里直接生图；`image-2-worker` 服务会消费 Redis 队列。扩容 worker：

```bash
docker compose up -d --scale image-2-worker=4
docker compose logs -f image-2-worker
```

`IMAGE_WORKER_CONCURRENCY=4` 且 4 个 worker 容器时，目标生图并发约为 `16`。实际吞吐仍取决于上游供应商限流、Redis、PostgreSQL 连接数、CPU、内存和共享存储 IO。裸 `pnpm dev` 且没有 `REDIS_URL` 时仍会使用内置进程内调度器；Docker 默认走 Redis。

### 单机站群和并发扩容

如果要让多个域名或单域名共用同一套数据库、Redis、storage 和 worker 池，使用 `docker-compose.scale.yml` 扩容 overlay。这个方案适合“单台服务器先扩容”：数据库、Redis 和存储仍在同一台机器上，Web 容器可以横向增加，生图任务由多个 Worker 容器消费 Redis 队列。

单机阶段的结构是：

```text
外层 1Panel / OpenResty / Nginx / CDN
  -> 宿主机 APP_PORT
  -> image-2-proxy
  -> 多个 image-2-studio Web 容器
  -> Redis 队列
  -> 多个 image-2-worker Worker 容器

共享资源：
  PostgreSQL x 1
  Redis x 1
  ./storage:/app/storage x 1
```

关键原则：

- 不为每个域名单独启动数据库、Redis 或 storage。
- Web 容器只负责页面、登录、上传、入队和 API 响应，不直接承担当作主力的高并发生图。
- Worker 容器负责真正调用上游模型生成图片。
- 所有 Web 和 Worker 必须挂载同一个宿主机 `./storage`，否则生成图、缩略图、下载和导出会在不同容器之间不一致。
- 跨机器扩容前必须先升级到对象存储、NFS 或其他共享存储方案。

#### 1. 准备 `.env`

先从 `.env.example` 复制并修改：

```bash
cp .env.example .env
nano .env
```

推荐起步配置：

```env
IMAGE_NAME=ghcr.io/paimonria/image-2-studio
IMAGE_TAG=latest
APP_PORT=3000

POSTGRES_PASSWORD=replace-with-a-strong-postgres-password
APP_SECRET=replace-with-at-least-32-random-characters
INITIAL_ADMIN_EMAIL=admin@your-domain.com
INITIAL_ADMIN_PASSWORD=replace-with-a-strong-admin-password

WEB_REPLICAS=2
WORKER_REPLICAS=4

DATABASE_CONNECTION_LIMIT=5
WORKER_DATABASE_CONNECTION_LIMIT=5
MIGRATE_DATABASE_CONNECTION_LIMIT=5

IMAGE_QUEUE_PREFIX=image2
IMAGE_JOB_CONCURRENCY=2
IMAGE_JOB_USER_CONCURRENCY=1
IMAGE_WORKER_CONCURRENCY=4
IMAGE_QUEUE_ATTEMPTS=3
IMAGE_QUEUE_BACKOFF_MS=5000
```

说明：

- `WEB_REPLICAS` / `WORKER_REPLICAS` 是默认副本数；实际执行 `--scale` 时可以覆盖。
- `DATABASE_CONNECTION_LIMIT` 控制每个 Web 容器最多占用的 PostgreSQL 连接数。
- `WORKER_DATABASE_CONNECTION_LIMIT` 控制每个 Worker 容器最多占用的 PostgreSQL 连接数。
- `IMAGE_WORKER_CONCURRENCY` 是每个 Worker 容器内部同时处理的生图任务数。
- 管理后台中的 `Worker 并发` 是单个 Worker 容器的并发上限，代码会限制在 `1..64`；单机总并发仍然要乘以 Worker 容器数，不是整台机器只能跑 64。
- Docker 默认使用内置 Redis：`REDIS_URL=redis://redis:6379/0`。如果 `.env` 中留空，compose 会自动给 Web 和 Worker 注入内置 Redis 地址。

如果使用外部 Redis：

```env
REDIS_URL=redis://:password@redis.example.com:6379/0
# 如果服务商要求 TLS：
REDIS_URL=rediss://:password@redis.example.com:6380/0
```

#### 2. 首次启动扩容栈

```bash
docker compose -f docker-compose.yml -f docker-compose.scale.yml --profile migrate run --rm image-2-migrate
docker compose -f docker-compose.yml -f docker-compose.scale.yml up -d --scale image-2-studio=2 --scale image-2-worker=4
docker compose -f docker-compose.yml -f docker-compose.scale.yml ps
```

必须先运行一次 `image-2-migrate`。它只负责执行 Prisma migration，完成后退出。扩容模式下 Web 容器会设置 `DB_MIGRATE_ON_START=false`，避免多个 Web 副本同时迁移数据库。

`docker-compose.scale.yml` 会把 Web 容器放到内部网络，由 `image-2-proxy` 暴露 `${APP_PORT:-3000}`。宿主机上的 1Panel、OpenResty 或 Nginx 可以把多个域名都反向代理到这个端口。

#### 3. 外层反向代理

```text
domain-a.com -> http://127.0.0.1:3000
domain-b.com -> http://127.0.0.1:3000
admin.domain.com -> http://127.0.0.1:3000/admin
```

外层反代必须保留：

```text
Host
X-Forwarded-Proto
X-Forwarded-For
X-Real-IP
```

HTTPS 建议在外层反代终止。上传和导出仍需要合理的 body size 与超时设置，建议外层保持不低于：

```text
client_max_body_size 12m
proxy_connect_timeout 10s
proxy_send_timeout 300s
proxy_read_timeout 300s
```

如果只是通过 `http://SERVER_IP:APP_PORT` 临时测试，可以加入：

```env
AUTH_COOKIE_SECURE=false
```

正式 HTTPS 部署不要设置 `AUTH_COOKIE_SECURE=false`。

#### 4. 高并发档位建议

目标生图并发的粗略计算：

```text
目标生图并发 ≈ image-2-worker 容器数 × IMAGE_WORKER_CONCURRENCY
```

推荐从低到高逐步调整：

| 档位 | Web 容器 | Worker 容器 | 每 Worker 并发 | 目标生图并发 | 适用情况 |
| --- | ---: | ---: | ---: | ---: | --- |
| 轻量 | 1 | 2 | 2 | 约 4 | 小团队、低频使用 |
| 标准 | 2 | 4 | 4 | 约 16 | 常规单机生产起步 |
| 高并发 | 3 | 6 | 4 | 约 24 | 上游额度稳定、机器资源充足 |
| 谨慎更高 | 3-4 | 8 | 4-6 | 约 32-48 | 需要持续观察数据库、Redis、CPU、内存和供应商限流 |

不要一开始把 `IMAGE_WORKER_CONCURRENCY` 拉到很高。优先增加 Worker 容器数，再小幅提高单 Worker 并发。如果出现供应商 `429`、超时、失败率升高、Redis 内存快速上涨或 PostgreSQL 连接紧张，先降低 `IMAGE_WORKER_CONCURRENCY` 或减少 Worker 数。

注意：后台可配置的 `Worker 并发` 最大值 `64` 是“每个 Worker 容器”的保护上限，防止误填超大值导致单进程打爆上游、数据库或内存。扩容模式下总并发按 Worker 容器数叠加，例如 4 个 Worker 且每个 16 并发，目标总并发约为 64；8 个 Worker 且每个 16 并发，目标总并发约为 128。是否能稳定跑满取决于上游限流、机器资源、Redis、PostgreSQL 和共享存储 IO。

示例：

```bash
# 标准：2 Web + 4 Worker，目标生图并发约 16
docker compose -f docker-compose.yml -f docker-compose.scale.yml up -d --scale image-2-studio=2 --scale image-2-worker=4

# 高并发：3 Web + 6 Worker，目标生图并发约 24
docker compose -f docker-compose.yml -f docker-compose.scale.yml up -d --scale image-2-studio=3 --scale image-2-worker=6
```

如果只改 `.env` 里的 `IMAGE_WORKER_CONCURRENCY`，需要重建 Worker 容器：

```bash
docker compose -f docker-compose.yml -f docker-compose.scale.yml up -d --force-recreate image-2-worker
```

如果在管理后台“队列与并发”里保存 Worker 并发，Worker 会轮询配置并自动重建运行时，不需要手动重启。

#### 5. 数据库连接数预算

多 Web + 多 Worker 后，PostgreSQL 连接数很容易先成为瓶颈。按下面公式估算：

```text
总连接预算 ≈ Web 容器数 × DATABASE_CONNECTION_LIMIT
          + Worker 容器数 × WORKER_DATABASE_CONNECTION_LIMIT
          + 迁移/维护预留连接
```

例如：

```text
3 Web × 5 + 6 Worker × 5 + 5 预留 = 50
```

单机内置 PostgreSQL 建议先把总连接控制在 `50` 左右。如果需要继续提高并发，优先考虑外部 PostgreSQL、连接池或更高规格数据库，而不是单纯继续增加 Worker。

#### 6. 查看状态和健康检查

```bash
docker compose -f docker-compose.yml -f docker-compose.scale.yml ps
docker compose -f docker-compose.yml -f docker-compose.scale.yml logs --tail=120 image-2-studio
docker compose -f docker-compose.yml -f docker-compose.scale.yml logs --tail=120 image-2-worker
curl http://127.0.0.1:3000/api/health
```

健康检查重点看：

- `status` 是否为 `ok`。
- `queueMode` 是否为 `redis`。
- `jobQueue.queue.ok` 是否为 `true`。
- `jobQueue.bullmq.waiting` / `active` 是否随任务提交变化。
- `workerRuntimeVersion` 是否与后台队列配置更新后同步变化。
- 管理后台“平台监控”中的失败率、平均排队、平均执行、供应商耗时和失败原因。

#### 7. 常见问题

Web 扩容时报端口冲突：

- 必须使用 `docker-compose.scale.yml`。
- 扩容模式下由 `image-2-proxy` 暴露宿主机端口，Web 容器不直接绑定 `${APP_PORT}`。

任务一直等待：

- 检查 `image-2-worker` 是否启动。
- 检查 `/api/health` 中 `queueMode=redis`、`jobQueue.queue.ok=true`。
- 检查 `REDIS_URL` 是否指向同一个 Redis。

图片在某些容器里打不开：

- 检查所有 Web 和 Worker 是否都挂载同一个 `./storage:/app/storage`。
- 单机阶段不要为不同容器配置不同 storage 目录。

数据库连接数耗尽：

- 降低 `DATABASE_CONNECTION_LIMIT` 和 `WORKER_DATABASE_CONNECTION_LIMIT`。
- 减少 Web/Worker 副本数。
- 优先降低 Worker 数或 `IMAGE_WORKER_CONCURRENCY`。

供应商限流或失败率升高：

- 降低 `IMAGE_WORKER_CONCURRENCY`。
- 减少 Worker 副本数。
- 增大 `IMAGE_QUEUE_BACKOFF_MS` 或降低提交速度。

#### 8. 缩容或调整副本

```bash
docker compose -f docker-compose.yml -f docker-compose.scale.yml up -d --scale image-2-studio=2 --scale image-2-worker=4
```

降低副本数时也使用同一条 `up -d --scale` 命令。建议先减少 Worker，再减少 Web，避免正在处理的任务突然全部中断。

### 3. 使用内置 PostgreSQL 和 Redis 启动

一行启动命令：

```bash
docker compose pull image-2-studio && docker compose up -d && docker compose ps && docker compose logs -f image-2-studio
```

```bash
docker compose pull image-2-studio
docker compose up -d
docker compose ps
docker compose logs -f image-2-studio
```

访问：

```text
http://SERVER_IP:3000
```

如果改了 `APP_PORT`，访问对应的宿主机端口。

容器启动时会在 `node server.js` 之前自动执行数据库迁移。默认启动行为：

```env
DB_MIGRATE_ON_START=true
DB_MIGRATE_ATTEMPTS=12
DB_MIGRATE_RETRY_SECONDS=5
```

只有在你准备自己提前执行 `prisma migrate deploy --schema prisma/schema.active.prisma` 时，才建议设置 `DB_MIGRATE_ON_START=false`。

### 4. 切换外部 PostgreSQL 或 Redis

项目只保留一个 `docker-compose.yml`。如果要使用外部 PostgreSQL，请在 `.env` 里设置 `DOCKER_DATABASE_URL`：

```env
DOCKER_DATABASE_URL=postgresql://db_user:db_password@db_host:5432/db_name?schema=public&connection_limit=10
```

如果要使用外部 Redis，在 `.env` 设置 `REDIS_URL`，或者直接修改 `docker-compose.yml` 里两处 `REDIS_URL`。

外部数据库账号需要具备执行 Prisma migration 的权限。如果你想完全停用内置服务，就把 `docker-compose.yml` 里的 `postgres` 或 `redis` 服务块，以及对应的 `depends_on` 一起删掉或注释掉。

### 5. 更新

日常测试镜像不需要本机安装 Docker。它从干净的本地工作区触发 GitHub Actions 发布，先执行本地验证，再让远端 workflow 构建并推送 dev 镜像。

发布前先提交改动并推送 `main`，确保当前 `HEAD` 已经在 `origin/main`：

```powershell
git status --short
git push origin main
pnpm.cmd run publish:dev
```

这个命令会检查 `gh auth status`、要求工作区干净，并触发 `docker-image.yml` 的 `channel=dev`。远端 workflow 会推送：

```text
ghcr.io/paimonria/image-2-studio:dev-latest
ghcr.io/paimonria/image-2-studio:dev-<short-sha>
```

它不会更新生产 `latest`。

查看远端运行记录：

```powershell
gh run list --workflow docker-image.yml --limit 5
```

如果你已经安装 Docker Desktop，并且明确想在本机直接构建镜像，可以使用：

```powershell
pnpm.cmd run publish:dev:docker
```

正式发布时，先确保发布提交已经在 `main`，然后创建并推送版本 tag。推送 tag 会自动发布生产镜像：

```powershell
pnpm.cmd run verify
git tag -a v1.2.23 -m "v1.2.23"
git push origin v1.2.23
```

tag push workflow 会推送：

```text
ghcr.io/paimonria/image-2-studio:v1.2.23
ghcr.io/paimonria/image-2-studio:latest
```

Actions 成功后，再到服务器更新。

一行更新命令：

```bash
docker compose pull image-2-studio && docker compose up -d && docker compose ps
```

默认栈：

```bash
docker compose pull image-2-studio image-2-worker
docker compose up -d
docker compose ps
```

worker 容器：

```bash
docker compose pull image-2-worker
docker compose up -d --scale image-2-worker=4
docker compose logs -f image-2-worker
```

容器启动时会先执行 Prisma migration，然后启动 Next.js。

### 发布检查清单

打正式版本 tag 前，请在干净工作区运行：

```powershell
pnpm.cmd run verify
$env:PLAYWRIGHT_CHANNEL='msedge'
pnpm.cmd run test:e2e
```

E2E smoke test 会 mock 生图接口，不会调用真实供应商。

tag 发布 workflow 成功后，在 Docker 主机上验证默认运行时：

```bash
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=120 image-2-worker
curl http://127.0.0.1:3000/api/health
```

健康检查应显示 `backend=redis`、`queue.ok=true`，并且提交新的后台生图任务后 BullMQ 的 `waiting` 或 `active` 有变化。

## 生产安全清单

- 应用前面使用 HTTPS，并在生产环境保持 `AUTH_COOKIE_SECURE=true`。
- 设置至少 32 位随机字符的唯一 `APP_SECRET`，不要使用示例值。
- 首次启动前替换默认的 `POSTGRES_PASSWORD` 和 `INITIAL_ADMIN_PASSWORD`。
- 外部 Redis 优先使用 `rediss://`，日志和工单里只共享脱敏后的 Redis 目标。
- 反向代理上传限制要和应用的单图 10MB 限制保持一致。
- 数据库和 `storage/` 备份应加密保存，定期轮换平台 API key，并减少管理员账号数量。
- 部署自动化使用最小权限的 GHCR token。
- 发布前检查 CI 产物里的依赖审计、Trivy 扫描和 SBOM 报告。

### 6. 回滚

把 `.env` 里的 `IMAGE_TAG` 改成旧版本镜像标签：

```env
IMAGE_TAG=<version-tag>
```

然后重新拉取并启动：

```bash
docker compose pull image-2-studio
docker compose up -d
```

如果使用外部 PostgreSQL 或 Redis，使用你修改后的 `docker-compose.yml`。

### 7. 健康检查和日志

```bash
curl http://127.0.0.1:${APP_PORT:-3000}/api/health
docker compose ps
docker compose logs -f image-2-studio
docker compose logs -f image-2-worker
```

外部 PostgreSQL 或 Redis 部署使用你修改后的 `docker-compose.yml`。

### 8. 停止

停止但保留数据：

```bash
docker compose down
```

停止并删除内置 PostgreSQL 和 Redis volume 会清空数据库与队列数据，谨慎使用：

```bash
docker compose down -v
```

## 数据持久化

默认内置部署会持久化：

- PostgreSQL 数据：Docker volume `postgres-data`。
- Redis 数据：Docker volume `redis-data`。
- 上传图和生成图：宿主机目录 `./storage`。

不要随意删除 `storage/`、`postgres-data` 或 `redis-data` volume。

## 备份和恢复

内置 PostgreSQL 备份：

```bash
mkdir -p backups
docker compose exec -T postgres pg_dump -U image2 -d image2 > backups/image2-$(date +%F).sql
tar -czf backups/storage-$(date +%F).tar.gz storage
```

恢复：

```bash
cat backups/image2-YYYY-MM-DD.sql | docker compose exec -T postgres psql -U image2 -d image2
tar -xzf backups/storage-YYYY-MM-DD.tar.gz
```

外部 PostgreSQL 请使用数据库服务商的备份恢复工具，同时仍要备份 `storage/`。

## Nginx 反向代理

正式部署建议使用 HTTPS，并反向代理到应用端口。下面的 `3000` 要替换成 `.env` 里的宿主机 `APP_PORT`；例如 `APP_PORT=3111` 时使用 `127.0.0.1:3111`。

```nginx
server {
    listen 80;
    server_name your-domain.example;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 300s;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        send_timeout 300s;
    }
}
```

生图可能耗时较长，建议把 `proxy_read_timeout` 保持在 `300s` 或更高，避免过早返回 `504 Gateway Time-out`。

每个应用容器最多同时运行 `IMAGE_JOB_CONCURRENCY` 个生图任务，单个用户在单容器内最多占用 `IMAGE_JOB_USER_CONCURRENCY` 个槽位。超出的任务会保持 pending，并由调度器从数据库继续捞取。`/api/health` 会返回当前队列状态、近 1 小时成功/失败数量、平均排队耗时、上游耗时和文件保存耗时。

生图任务现在使用 `ImageJob` 上的轻量数据库 lease 和 heartbeat，因此多个 app 容器可以同时 claim pending 任务，避免同一个任务被重复执行。如果正在执行任务的容器被杀掉，任务会在心跳超时后标记失败并返还平台额度。

如果使用 1Panel/OpenResty，把同样的超时配置加到网站反向代理的高级配置里，然后重载或重启 OpenResty。如果浏览器大约 60 秒失败，但 `docker compose logs -f image-2-studio` 里稍后才出现生图失败日志，通常是站点反向代理先关闭了客户端请求。如果容器日志本身显示 `524`，查看日志里的 `baseUrlHost`，继续排查上游网关链路。

如果生成图片保存失败，检查挂载的 storage 目录是否允许应用用户写入：

```bash
docker compose exec -u nextjs image-2-studio sh -lc 'touch /app/storage/.write-test && rm /app/storage/.write-test'
```

## 常见问题

### `docker compose` 命令不存在

安装 Docker Compose plugin 后验证：

```bash
docker compose version
```

### 容器 unhealthy 或页面打不开

```bash
docker compose ps
docker compose logs -f image-2-studio
curl http://127.0.0.1:${APP_PORT:-3000}/api/health
```

同时检查云服务器安全组、防火墙和端口开放情况。

### 端口被占用

修改 `.env` 里的 `APP_PORT`，然后重启：

```env
APP_PORT=3100
```

```bash
docker compose up -d
```

### 更换 `APP_SECRET` 后 API key 失效

`APP_SECRET` 用于加密保存的 API key。生产部署后不要随意更换；如果必须更换，需要用户和管理员重新保存 API key。

## 目录说明

```text
src/app/                  Next.js 页面和 API 路由
src/components/studio/    Studio UI 组件和 UI 状态 hooks
src/lib/server/           服务端数据库、认证、文件、供应商配置
src/lib/server/providers/ OpenAI provider adapter
src/worker/               图片 worker 的 TypeScript 入口
dist-worker/              被忽略的 worker 构建输出，由 `pnpm run build:worker` 生成
prisma/                   Prisma schema 和迁移
scripts/                  Prisma 切换、Docker entrypoint 和镜像发布脚本
tests/                    Node 测试
e2e/                      Playwright smoke tests
storage/                  运行时上传图和生成图；生产环境不要删除
public/                   静态资源以及 generated/upload 占位目录
.next/, .test-dist/       被忽略的本地构建和测试输出
```

## License

Image-2 Studio 使用 MIT License。详见 [LICENSE](./LICENSE)。
