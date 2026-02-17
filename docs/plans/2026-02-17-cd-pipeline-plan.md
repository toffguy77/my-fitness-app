# CD Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a complete CD pipeline that deploys dev (new.burcev.team) and production (burcev.team) environments to a single VDS via GitHub Actions, Docker, and nginx with Let's Encrypt SSL.

**Architecture:** Single docker-compose on VDS with shared nginx (two vhosts), isolated dev/prod app containers, external PostgreSQL. CD triggers after CI success. Images stored in GHCR, deployed via SSH.

**Tech Stack:** GitHub Actions, Docker, docker-compose, nginx, certbot, GHCR

**Design doc:** `docs/plans/2026-02-17-cd-pipeline-design.md`

---

### Task 1: Create production nginx vhost config

**Files:**
- Create: `deploy/nginx/burcev.team.conf`
- Reference: `deploy/nginx/new.burcev.team.conf` (copy and adapt)

**Step 1: Create burcev.team.conf**

Based on the existing `new.burcev.team.conf`, create `deploy/nginx/burcev.team.conf` with these changes:
- `server_name burcev.team`
- SSL cert paths: `/etc/letsencrypt/live/burcev.team/fullchain.pem` and `privkey.pem`
- Upstream: `$web_upstream burcev-prod:3069` and `$api_upstream burcev-api-prod:4000`
- All proxy settings, security headers, and ACME challenge identical to dev config

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name burcev.team;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name burcev.team;

    ssl_certificate /etc/letsencrypt/live/burcev.team/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/burcev.team/privkey.pem;

    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    resolver 127.0.0.11 valid=10s ipv6=off;
    set $web_upstream burcev-prod:3069;
    set $api_upstream burcev-api-prod:4000;

    location /api/v1/ {
        proxy_pass http://$api_upstream;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 90s;
        proxy_read_timeout 90s;
    }

    location = /health {
        proxy_pass http://$api_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://$web_upstream;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90s;
        proxy_connect_timeout 90s;
    }
}
```

**Step 2: Commit**

```bash
git add deploy/nginx/burcev.team.conf
git commit -m "feat(deploy): add production nginx vhost for burcev.team"
```

---

### Task 2: Update nginx Dockerfile to include both configs

**Files:**
- Modify: `deploy/nginx/Dockerfile`

**Step 1: Update Dockerfile**

Replace current content with:

```dockerfile
FROM nginx:alpine

RUN rm -f /etc/nginx/conf.d/default.conf

COPY new.burcev.team.conf /etc/nginx/conf.d/new.burcev.team.conf
COPY burcev.team.conf /etc/nginx/conf.d/burcev.team.conf

EXPOSE 80 443
```

**Step 2: Commit**

```bash
git add deploy/nginx/Dockerfile
git commit -m "feat(deploy): nginx image serves both dev and prod vhosts"
```

---

### Task 3: Create server docker-compose file

**Files:**
- Create: `deploy/docker-compose.server.yml`
- Reference: `deploy/docker-compose.dev.yml` (existing)

**Step 1: Create docker-compose.server.yml**

This is the single compose file deployed to the VDS. It defines all 5 services: nginx, web-dev, api-dev, web-prod, api-prod. Dev and prod use separate networks. Nginx connects to both.

```yaml
# Server deployment: burcev.team (prod) + new.burcev.team (dev)
# Uses pre-built GHCR images. Image tags passed via .env.compose.
# Requires: .env.dev and .env.prod on server, SSL certs at /etc/letsencrypt

services:
  nginx:
    image: ${NGINX_IMAGE}
    container_name: burcev-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - /var/www/certbot:/var/www/certbot:ro
    depends_on:
      api-dev:
        condition: service_healthy
      api-prod:
        condition: service_healthy
    networks:
      - burcev_dev
      - burcev_prod
    restart: unless-stopped

  # --- DEV environment (new.burcev.team) ---
  web-dev:
    image: ${WEB_DEV_IMAGE}
    container_name: burcev-dev
    env_file:
      - .env.dev
    environment:
      - PORT=3069
      - NODE_ENV=production
    networks:
      - burcev_dev
    restart: unless-stopped

  api-dev:
    image: ${API_DEV_IMAGE}
    container_name: burcev-api-dev
    env_file:
      - .env.dev
    environment:
      - PORT=4000
      - NODE_ENV=production
    networks:
      - burcev_dev
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:4000/health"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 10s

  # --- PROD environment (burcev.team) ---
  web-prod:
    image: ${WEB_PROD_IMAGE}
    container_name: burcev-prod
    env_file:
      - .env.prod
    environment:
      - PORT=3069
      - NODE_ENV=production
    networks:
      - burcev_prod
    restart: unless-stopped

  api-prod:
    image: ${API_PROD_IMAGE}
    container_name: burcev-api-prod
    env_file:
      - .env.prod
    environment:
      - PORT=4000
      - NODE_ENV=production
    networks:
      - burcev_prod
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:4000/health"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 10s

networks:
  burcev_dev:
    driver: bridge
  burcev_prod:
    driver: bridge
```

**Step 2: Commit**

```bash
git add deploy/docker-compose.server.yml
git commit -m "feat(deploy): unified server compose with dev + prod environments"
```

---

### Task 4: Create production env example

**Files:**
- Create: `deploy/env/.env.prod.example`
- Reference: `deploy/env/.env.dev.example`

**Step 1: Create .env.prod.example**

```env
# Production environment file for VPS deployment
# Copy to: ${DEPLOY_PATH}/.env.prod
# IMPORTANT: do not commit the real .env.prod (secrets) into git.

# App
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://burcev.team

# Logging (production: less verbose)
LOG_LEVEL=warn
NEXT_PUBLIC_LOG_LEVEL=WARN
NEXT_PUBLIC_DEBUG_MODE=false
DEBUG_MODE=false

# Database
DATABASE_URL=postgresql://user:password@host:6432/dbname?sslmode=require
DB_MAX_OPEN_CONNS=25
DB_MAX_IDLE_CONNS=5

# JWT
JWT_SECRET=change-me-in-production

# CORS
CORS_ORIGIN=https://burcev.team

# SMTP
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_USERNAME=your-email@yandex.ru
SMTP_PASSWORD=your-app-password
SMTP_FROM_ADDRESS=noreply@burcev.team
SMTP_FROM_NAME=BURCEV

# Password Reset
RESET_PASSWORD_URL=https://burcev.team/reset-password

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_prod_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_prod_supabase_anon_key

# Email (Resend)
RESEND_API_KEY=re_xxxxx
RESEND_FROM_EMAIL=BURCEV <noreply@burcev.team>

# S3 (Yandex.Cloud Object Storage)
S3_ACCESS_KEY_ID=your_access_key
S3_SECRET_ACCESS_KEY=your_secret_key
S3_BUCKET=weekly-progress-photos
S3_REGION=ru-central1
S3_ENDPOINT=https://storage.yandexcloud.net
```

**Step 2: Commit**

```bash
git add deploy/env/.env.prod.example
git commit -m "feat(deploy): add production env example"
```

---

### Task 5: Create the CD workflow

**Files:**
- Create: `.github/workflows/cd.yml`

This is the main task. The workflow has two jobs: `deploy-dev` and `deploy-prod`.

**Step 1: Create cd.yml**

```yaml
name: CD Pipeline

on:
  workflow_run:
    workflows: ["CI Pipeline"]
    types: [completed]
    branches: [dev, main]

  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to deploy'
        required: true
        type: choice
        options:
          - dev
          - production
      ref:
        description: 'Git ref to deploy (default: branch tip)'
        required: false
        type: string

permissions:
  contents: read
  packages: write

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  # ── DEV DEPLOY ──────────────────────────────────────────────
  deploy-dev:
    name: Deploy dev → new.burcev.team
    runs-on: ubuntu-latest
    if: >-
      (github.event_name == 'workflow_run'
       && github.event.workflow_run.conclusion == 'success'
       && github.event.workflow_run.head_branch == 'dev')
      || (github.event_name == 'workflow_dispatch'
          && github.event.inputs.environment == 'dev')
    concurrency:
      group: cd-dev
      cancel-in-progress: false
    environment: dev

    steps:
      - name: Resolve ref
        id: ref
        run: |
          if [[ "${{ github.event_name }}" == "workflow_dispatch" ]]; then
            echo "ref=${{ github.event.inputs.ref || 'dev' }}" >> "$GITHUB_OUTPUT"
          else
            echo "ref=${{ github.event.workflow_run.head_sha }}" >> "$GITHUB_OUTPUT"
          fi

      - name: Checkout
        uses: actions/checkout@v4
        with:
          ref: ${{ steps.ref.outputs.ref }}

      - name: Git SHA
        id: git
        run: echo "sha=$(git rev-parse --short HEAD)" >> "$GITHUB_OUTPUT"

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build & push nginx
        uses: docker/build-push-action@v5
        with:
          context: deploy/nginx
          file: deploy/nginx/Dockerfile
          platforms: linux/amd64
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:nginx-${{ steps.git.outputs.sha }}
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:nginx-latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build & push frontend (dev)
        uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/web/Dockerfile
          target: runner
          platforms: linux/amd64
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:web-dev-${{ steps.git.outputs.sha }}
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:web-dev-latest
          build-args: |
            NEXT_PUBLIC_API_URL=https://new.burcev.team
            NEXT_PUBLIC_APP_VERSION=${{ steps.git.outputs.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build & push backend (dev)
        uses: docker/build-push-action@v5
        with:
          context: apps/api
          file: apps/api/Dockerfile
          target: production
          platforms: linux/amd64
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:api-dev-${{ steps.git.outputs.sha }}
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:api-dev-latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Deploy via SSH
        env:
          DEPLOY_SSH_HOST: ${{ secrets.DEPLOY_SSH_HOST }}
          DEPLOY_SSH_USER: ${{ secrets.DEPLOY_SSH_USER }}
          DEPLOY_SSH_PRIVATE_KEY: ${{ secrets.DEPLOY_SSH_PRIVATE_KEY }}
          DEPLOY_PATH: ${{ secrets.DEPLOY_PATH }}
          DEPLOY_GHCR_USERNAME: ${{ secrets.DEPLOY_GHCR_USERNAME }}
          DEPLOY_GHCR_TOKEN: ${{ secrets.DEPLOY_GHCR_TOKEN }}
          SHA: ${{ steps.git.outputs.sha }}
        run: |
          set -euo pipefail

          mkdir -p ~/.ssh
          printf "%s\n" "${DEPLOY_SSH_PRIVATE_KEY}" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          ssh-keyscan "${DEPLOY_SSH_HOST}" >> ~/.ssh/known_hosts 2>/dev/null || true

          scp -i ~/.ssh/id_ed25519 -o StrictHostKeyChecking=no \
            deploy/docker-compose.server.yml \
            "${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}:${DEPLOY_PATH}/"

          ssh -i ~/.ssh/id_ed25519 "${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}" \
            "DEPLOY_PATH='${DEPLOY_PATH}' GHCR_USERNAME='${DEPLOY_GHCR_USERNAME}' GHCR_TOKEN='${DEPLOY_GHCR_TOKEN}' \
             REGISTRY='${REGISTRY}' IMAGE_NAME='${IMAGE_NAME}' SHA='${SHA}' bash -s" <<'REMOTE'
          set -euo pipefail
          cd "$DEPLOY_PATH"

          echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin

          # Write image tags for dev services + nginx
          # Preserve existing prod image tags if .env.compose exists
          if [[ -f .env.compose ]]; then
            source .env.compose
          fi

          cat > .env.compose << EOF
          NGINX_IMAGE=${REGISTRY}/${IMAGE_NAME}:nginx-${SHA}
          WEB_DEV_IMAGE=${REGISTRY}/${IMAGE_NAME}:web-dev-${SHA}
          API_DEV_IMAGE=${REGISTRY}/${IMAGE_NAME}:api-dev-${SHA}
          WEB_PROD_IMAGE=${WEB_PROD_IMAGE:-${REGISTRY}/${IMAGE_NAME}:web-prod-latest}
          API_PROD_IMAGE=${API_PROD_IMAGE:-${REGISTRY}/${IMAGE_NAME}:api-prod-latest}
          EOF

          docker compose -f docker-compose.server.yml --env-file .env.compose pull nginx web-dev api-dev
          docker compose -f docker-compose.server.yml --env-file .env.compose up -d --no-recreate web-prod api-prod
          docker compose -f docker-compose.server.yml --env-file .env.compose up -d nginx web-dev api-dev
          docker image prune -f
          REMOTE

      - name: Health check
        run: |
          set -euo pipefail
          echo "Waiting for dev deployment..."
          for i in $(seq 1 30); do
            if curl -fsS --max-time 10 https://new.burcev.team/ >/dev/null 2>&1; then
              echo "✓ Web OK"
              break
            fi
            [[ $i -eq 30 ]] && { echo "✗ Web health check failed" >&2; exit 1; }
            sleep 2
          done
          for i in $(seq 1 15); do
            if curl -fsS --max-time 10 https://new.burcev.team/health >/dev/null 2>&1; then
              echo "✓ API OK"
              break
            fi
            [[ $i -eq 15 ]] && { echo "✗ API health check failed" >&2; exit 1; }
            sleep 2
          done

  # ── PROD DEPLOY ─────────────────────────────────────────────
  deploy-prod:
    name: Deploy prod → burcev.team
    runs-on: ubuntu-latest
    if: >-
      (github.event_name == 'workflow_run'
       && github.event.workflow_run.conclusion == 'success'
       && github.event.workflow_run.head_branch == 'main')
      || (github.event_name == 'workflow_dispatch'
          && github.event.inputs.environment == 'production')
    concurrency:
      group: cd-prod
      cancel-in-progress: false
    environment: production

    steps:
      - name: Resolve ref
        id: ref
        run: |
          if [[ "${{ github.event_name }}" == "workflow_dispatch" ]]; then
            echo "ref=${{ github.event.inputs.ref || 'main' }}" >> "$GITHUB_OUTPUT"
          else
            echo "ref=${{ github.event.workflow_run.head_sha }}" >> "$GITHUB_OUTPUT"
          fi

      - name: Checkout
        uses: actions/checkout@v4
        with:
          ref: ${{ steps.ref.outputs.ref }}

      - name: Git SHA
        id: git
        run: echo "sha=$(git rev-parse --short HEAD)" >> "$GITHUB_OUTPUT"

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build & push nginx
        uses: docker/build-push-action@v5
        with:
          context: deploy/nginx
          file: deploy/nginx/Dockerfile
          platforms: linux/amd64
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:nginx-${{ steps.git.outputs.sha }}
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:nginx-latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build & push frontend (prod)
        uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/web/Dockerfile
          target: runner
          platforms: linux/amd64
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:web-prod-${{ steps.git.outputs.sha }}
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:web-prod-latest
          build-args: |
            NEXT_PUBLIC_API_URL=https://burcev.team
            NEXT_PUBLIC_APP_VERSION=${{ steps.git.outputs.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build & push backend (prod)
        uses: docker/build-push-action@v5
        with:
          context: apps/api
          file: apps/api/Dockerfile
          target: production
          platforms: linux/amd64
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:api-prod-${{ steps.git.outputs.sha }}
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:api-prod-latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Deploy via SSH
        env:
          DEPLOY_SSH_HOST: ${{ secrets.DEPLOY_SSH_HOST }}
          DEPLOY_SSH_USER: ${{ secrets.DEPLOY_SSH_USER }}
          DEPLOY_SSH_PRIVATE_KEY: ${{ secrets.DEPLOY_SSH_PRIVATE_KEY }}
          DEPLOY_PATH: ${{ secrets.DEPLOY_PATH }}
          DEPLOY_GHCR_USERNAME: ${{ secrets.DEPLOY_GHCR_USERNAME }}
          DEPLOY_GHCR_TOKEN: ${{ secrets.DEPLOY_GHCR_TOKEN }}
          SHA: ${{ steps.git.outputs.sha }}
        run: |
          set -euo pipefail

          mkdir -p ~/.ssh
          printf "%s\n" "${DEPLOY_SSH_PRIVATE_KEY}" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          ssh-keyscan "${DEPLOY_SSH_HOST}" >> ~/.ssh/known_hosts 2>/dev/null || true

          scp -i ~/.ssh/id_ed25519 -o StrictHostKeyChecking=no \
            deploy/docker-compose.server.yml \
            "${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}:${DEPLOY_PATH}/"

          ssh -i ~/.ssh/id_ed25519 "${DEPLOY_SSH_USER}@${DEPLOY_SSH_HOST}" \
            "DEPLOY_PATH='${DEPLOY_PATH}' GHCR_USERNAME='${DEPLOY_GHCR_USERNAME}' GHCR_TOKEN='${DEPLOY_GHCR_TOKEN}' \
             REGISTRY='${REGISTRY}' IMAGE_NAME='${IMAGE_NAME}' SHA='${SHA}' bash -s" <<'REMOTE'
          set -euo pipefail
          cd "$DEPLOY_PATH"

          echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin

          # Preserve existing dev image tags
          if [[ -f .env.compose ]]; then
            source .env.compose
          fi

          cat > .env.compose << EOF
          NGINX_IMAGE=${REGISTRY}/${IMAGE_NAME}:nginx-${SHA}
          WEB_DEV_IMAGE=${WEB_DEV_IMAGE:-${REGISTRY}/${IMAGE_NAME}:web-dev-latest}
          API_DEV_IMAGE=${API_DEV_IMAGE:-${REGISTRY}/${IMAGE_NAME}:api-dev-latest}
          WEB_PROD_IMAGE=${REGISTRY}/${IMAGE_NAME}:web-prod-${SHA}
          API_PROD_IMAGE=${REGISTRY}/${IMAGE_NAME}:api-prod-${SHA}
          EOF

          docker compose -f docker-compose.server.yml --env-file .env.compose pull nginx web-prod api-prod
          docker compose -f docker-compose.server.yml --env-file .env.compose up -d --no-recreate web-dev api-dev
          docker compose -f docker-compose.server.yml --env-file .env.compose up -d nginx web-prod api-prod
          docker image prune -f
          REMOTE

      - name: Health check
        run: |
          set -euo pipefail
          echo "Waiting for prod deployment..."
          for i in $(seq 1 30); do
            if curl -fsS --max-time 10 https://burcev.team/ >/dev/null 2>&1; then
              echo "✓ Web OK"
              break
            fi
            [[ $i -eq 30 ]] && { echo "✗ Web health check failed" >&2; exit 1; }
            sleep 2
          done
          for i in $(seq 1 15); do
            if curl -fsS --max-time 10 https://burcev.team/health >/dev/null 2>&1; then
              echo "✓ API OK"
              break
            fi
            [[ $i -eq 15 ]] && { echo "✗ API health check failed" >&2; exit 1; }
            sleep 2
          done
```

**Step 2: Commit**

```bash
git add .github/workflows/cd.yml
git commit -m "feat(cd): unified CD pipeline for dev + prod environments"
```

---

### Task 6: Clean up old deploy files

**Files:**
- Delete: `deploy/docker-compose.dev.yml` (replaced by `docker-compose.server.yml`)

**Step 1: Remove old compose file**

```bash
git rm deploy/docker-compose.dev.yml
```

**Step 2: Commit**

```bash
git commit -m "chore(deploy): remove old dev-only compose (replaced by server.yml)"
```

---

### Task 7: Validate workflow YAML syntax

**Step 1: Install actionlint (if available) and validate**

```bash
# If actionlint is installed:
actionlint .github/workflows/cd.yml

# Otherwise, basic YAML validation:
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/cd.yml'))"
```

Expected: no errors.

**Step 2: Validate docker-compose syntax**

```bash
docker compose -f deploy/docker-compose.server.yml config --quiet 2>&1 || echo "Needs env vars — expected"
```

This will error about missing env vars which is expected (they're set at deploy time).

---

### Task 8: Server-side SSL setup (documentation only)

This task is manual and should be done once on the VDS. Document the commands:

**Commands to run on VDS (91.236.79.100):**

```bash
# 1. Install certbot
apt update && apt install -y certbot

# 2. Stop any service on port 80 temporarily
docker compose -f /opt/burcev/docker-compose.server.yml down 2>/dev/null || true

# 3. Get certificates for both domains
certbot certonly --standalone -d burcev.team -d new.burcev.team

# 4. Create certbot auto-renewal cron
cat > /etc/cron.d/certbot-renew << 'EOF'
0 3 * * * root certbot renew --pre-hook "docker stop burcev-nginx 2>/dev/null || true" --post-hook "docker start burcev-nginx 2>/dev/null || true" >> /var/log/certbot-renew.log 2>&1
EOF

# 5. Create /var/www/certbot directory
mkdir -p /var/www/certbot

# 6. Create .env.prod from template
cp /opt/burcev/.env.dev /opt/burcev/.env.prod
# Then edit .env.prod with production values
```

No git commit needed — this is server setup documentation.
