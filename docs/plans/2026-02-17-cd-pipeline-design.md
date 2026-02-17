# CD Pipeline Design — burcev.team

**Date:** 2026-02-17
**Status:** Approved
**Environments:** dev (new.burcev.team) + production (burcev.team)
**Server:** VDS 91.236.79.100

## Architecture

Two environments on a single VDS. One shared nginx container routes traffic by domain to isolated dev/prod application containers. External PostgreSQL on Yandex.Cloud.

```
VDS 91.236.79.100
├── certbot (host) → /etc/letsencrypt/
└── docker-compose.server.yml
    ├── nginx:80,443 (shared, both vhosts)
    │   ├── new.burcev.team → web-dev:3069 + api-dev:4000
    │   └── burcev.team     → web-prod:3069 + api-prod:4000
    ├── web-dev:3069   (Next.js, GHCR image)
    ├── api-dev:4000   (Go/Gin, GHCR image)
    ├── web-prod:3069  (Next.js, GHCR image)
    └── api-prod:4000  (Go/Gin, GHCR image)
```

Networks: `burcev_dev`, `burcev_prod`. Nginx connects to both.

## CD Workflow (`.github/workflows/cd.yml`)

**Trigger:** `workflow_run` after CI succeeds on `dev` or `main`, plus `workflow_dispatch`.

**Jobs:**
- `deploy-dev` (branch `dev` → new.burcev.team)
- `deploy-prod` (branch `main` → burcev.team)

Each job:
1. Build 3 Docker images (nginx, web, api) → push to GHCR
2. SSH to VDS → copy compose file
3. Pull only changed images
4. `docker compose up -d` (recreate only affected services)
5. Health checks (curl web + /health)

**Concurrency:** `cd-dev` and `cd-prod` groups — no interference.

**Image tags:** `*-dev-{sha}`, `*-prod-{sha}` + rolling `*-dev`, `*-prod`.

## SSL (Let's Encrypt)

Certbot runs on the host, not in a container.

```bash
certbot certonly --standalone -d burcev.team -d new.burcev.team
```

Cron for auto-renewal:
```
0 3 * * * certbot renew --deploy-hook "docker exec burcev-nginx nginx -s reload"
```

Nginx mounts `/etc/letsencrypt/` as read-only volume.
ACME challenge via `/.well-known/acme-challenge/` → `/var/www/certbot`.

## GitHub Secrets (existing)

- `DEPLOY_SSH_HOST`, `DEPLOY_SSH_USER`, `DEPLOY_SSH_PRIVATE_KEY` — SSH access
- `DEPLOY_PATH` — server path (e.g., `/opt/burcev`)
- `DEPLOY_GHCR_USERNAME`, `DEPLOY_GHCR_TOKEN` — GHCR access

Build-time args (Supabase, etc.) from GitHub environment secrets per env.

## Server-side env files

- `$DEPLOY_PATH/.env.dev` — dev container env vars (DB, JWT, SMTP, etc.)
- `$DEPLOY_PATH/.env.prod` — prod container env vars

## Files to create/update

| File | Action |
|------|--------|
| `.github/workflows/cd.yml` | Create |
| `deploy/docker-compose.server.yml` | Create |
| `deploy/nginx/burcev.team.conf` | Create |
| `deploy/nginx/new.burcev.team.conf` | Update (unchanged) |
| `deploy/nginx/Dockerfile` | Update (copy both configs) |
| `deploy/env/.env.prod.example` | Create |

## Rollback

Re-run CD workflow with `workflow_dispatch`, specifying a previous git ref.
Or SSH to server → update image tags in `.env.compose` → `docker compose up -d`.
