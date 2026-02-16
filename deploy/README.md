# Deploy (dev: new.burcev.team)

## Требования на сервере

- Docker и Docker Compose v2
- `.env.dev` в `DEPLOY_PATH` (база Yandex Cloud, JWT, Supabase и т.д.)
- SSL-сертификаты Let's Encrypt: `/etc/letsencrypt/live/new.burcev.team/`
- Порты 80 и 443 свободны (если host nginx уже слушает — отключите или настройте проксирование)

## GitHub Secrets (environment: dev)

| Secret | Описание |
|--------|----------|
| `DEPLOY_SSH_HOST` | IP или hostname сервера |
| `DEPLOY_SSH_PORT` | SSH порт (по умолчанию 22) |
| `DEPLOY_SSH_USER` | SSH пользователь |
| `DEPLOY_SSH_PRIVATE_KEY` | Приватный SSH ключ (полностью, включая BEGIN/END) |
| `DEPLOY_PATH` | Путь на сервере (например `/home/user/burcev`) |
| `DEPLOY_GHCR_USERNAME` | GitHub username для GHCR |
| `DEPLOY_GHCR_TOKEN` | Personal Access Token с `read:packages` |
| `DEV_SUPABASE_URL` | Supabase URL для dev |
| `DEV_SUPABASE_ANON_KEY` | Supabase anon key для dev |

**`.env.dev` на сервере** должен содержать: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN=https://new.burcev.team`, Supabase, S3 и др.

## Структура на сервере

```
$DEPLOY_PATH/
├── .env.dev          # Переменные окружения (DB, JWT, Supabase, S3 и т.д.)
├── docker-compose.dev.yml  # Копируется при деплое
└── .env.compose      # Создаётся при деплое (образы)
```

## Локальный запуск

```bash
# Сборка образов
docker build -t nginx-dev -f deploy/nginx/Dockerfile deploy/nginx
docker build -t web-dev -f apps/web/Dockerfile .
docker build -t api-dev -f apps/api/Dockerfile apps/api

# Запуск (нужен .env.dev в deploy/ или в $PWD)
cd deploy
NGINX_IMAGE=nginx-dev WEB_IMAGE=web-dev API_IMAGE=api-dev \
  docker compose -f docker-compose.dev.yml up -d
```
