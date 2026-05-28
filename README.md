# Image-2 Studio

Image-2 Studio is a multi-user AI image generation workspace for OpenAI `gpt-image-2` and OpenAI-compatible gateways.

Full documentation is maintained in Chinese: [README.zh.md](./README.zh.md).

## What It Does

- Multi-user login, registration, encrypted API keys, and per-user image history.
- Admin controls for users, registration, provider settings, quotas, usage, and recent history.
- Text-to-image, image-to-image, and continue-edit workflows when supported by the configured gateway.
- Docker production deployment through prebuilt GHCR images.
- Redis-backed worker queue for background image generation in Docker deployments.

## Local Development

```powershell
pnpm.cmd install
copy .env.example .env.local
pnpm.cmd run db:sqlite
pnpm.cmd run db:push
pnpm.cmd dev
```

Open:

```text
http://localhost:3000
```

Useful checks:

```powershell
pnpm.cmd run verify
$env:PLAYWRIGHT_CHANNEL='msedge'
pnpm.cmd run test:e2e
```

## Docker Images

Daily development publishing does not require local Docker. It triggers GitHub Actions from your local machine, runs the normal verification first, then publishes only dev image tags.

Before publishing, commit your changes and push `main` so local `HEAD` matches `origin/main`:

```powershell
git status --short
git push origin main
pnpm.cmd run publish:dev
```

The script checks `gh auth status`, requires a clean working tree, and triggers `docker-image.yml` with `channel=dev`. The workflow publishes:

```text
ghcr.io/paimonria/image-2-studio:dev-latest
ghcr.io/paimonria/image-2-studio:dev-<short-sha>
```

To inspect the remote run:

```powershell
gh run list --workflow docker-image.yml --limit 5
```

If you have Docker Desktop installed and intentionally want to build locally, use:

```powershell
pnpm.cmd run publish:dev:docker
```

Production servers continue to use:

```env
IMAGE_TAG=latest
```

`latest` is updated automatically when a `v*` tag is pushed.

For single-host scale deployments, keep one PostgreSQL, one Redis, and one shared `./storage` directory, then layer the scale compose file on top of the default stack. See [README.zh.md](./README.zh.md) for the full operational runbook.

```powershell
docker compose -f docker-compose.yml -f docker-compose.scale.yml --profile migrate run --rm image-2-migrate
docker compose -f docker-compose.yml -f docker-compose.scale.yml up -d --scale image-2-studio=2 --scale image-2-worker=4
docker compose -f docker-compose.yml -f docker-compose.scale.yml ps
```

Recommended starting environment:

```env
WEB_REPLICAS=2
WORKER_REPLICAS=4
DATABASE_CONNECTION_LIMIT=5
WORKER_DATABASE_CONNECTION_LIMIT=5
MIGRATE_DATABASE_CONNECTION_LIMIT=5
IMAGE_QUEUE_PREFIX=image2
IMAGE_WORKER_CONCURRENCY=4
IMAGE_QUEUE_ATTEMPTS=3
IMAGE_QUEUE_BACKOFF_MS=5000
```

`docker-compose.scale.yml` routes scaled web containers through the bundled Nginx proxy and keeps image generation in Redis-backed workers. Target generation concurrency is roughly:

```text
worker replicas × IMAGE_WORKER_CONCURRENCY
```

For example, `4` worker containers with `IMAGE_WORKER_CONCURRENCY=4` target roughly `16` concurrent image jobs. Start by adding worker replicas before raising per-worker concurrency. Watch upstream 429s, failed job rate, Redis memory, CPU, RAM, and PostgreSQL connections before scaling further.

The admin UI caps `Worker concurrency` at `64` per worker container. That is a per-process guardrail, not a whole-machine cap; total target concurrency is still worker replicas multiplied by per-worker concurrency.

Run the migration container once before rolling scaled web replicas. The scaled web containers set `DB_MIGRATE_ON_START=false` so multiple replicas do not run Prisma migrations at the same time. Point one or more external domains at `${APP_PORT:-3000}` on the host; the bundled proxy forwards `Host` and `X-Forwarded-*` headers to the app.

Useful scale checks:

```powershell
docker compose -f docker-compose.yml -f docker-compose.scale.yml logs --tail=120 image-2-worker
curl http://127.0.0.1:3000/api/health
```

Connection budget:

```text
web replicas × DATABASE_CONNECTION_LIMIT
+ worker replicas × WORKER_DATABASE_CONNECTION_LIMIT
+ reserved migration/admin connections
```

Keep the bundled single-host PostgreSQL budget conservative, around `50` total connections to start. For higher sustained throughput, move to external PostgreSQL or a connection pool before continuing to add worker capacity.

Production release flow:

```powershell
pnpm.cmd run verify
git tag -a v1.2.23 -m "v1.2.23"
git push origin v1.2.23
```

The tag workflow publishes:

```text
ghcr.io/paimonria/image-2-studio:v1.2.23
ghcr.io/paimonria/image-2-studio:latest
```

## Production Security Checklist

- Use HTTPS in front of the app and keep `AUTH_COOKIE_SECURE=true` in production.
- Set a unique `APP_SECRET` of at least 32 random characters; never use example values.
- Replace default `POSTGRES_PASSWORD` and `INITIAL_ADMIN_PASSWORD` before first boot.
- Prefer `rediss://` for external Redis and only share redacted Redis targets in logs or tickets.
- Keep reverse proxy upload limits aligned with the app's 10MB per-image limit.
- Encrypt database and storage backups, rotate platform API keys, and keep admin accounts minimal.
- Use least-privilege GHCR tokens for deployment automation.
- Review CI artifacts for dependency audit, Trivy scan, and SBOM reports before release.

## Project Layout

```text
src/app/                  Next.js pages and API routes
src/components/studio/    Studio UI components and hooks
src/lib/server/           Server database, auth, files, jobs, and providers
src/worker/               Image worker TypeScript entrypoint
prisma/                   Prisma schemas and migrations
scripts/                  Prisma, Docker, and image publishing helpers
tests/                    Node test suite
e2e/                      Playwright smoke tests
dist-worker/              Ignored worker build output
storage/                  Runtime uploaded and generated images
```

## License

Image-2 Studio is licensed under the MIT License. See [LICENSE](./LICENSE).
