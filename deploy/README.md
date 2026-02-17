# Deploy (dev + prod)

## Окружения

| Env | Domain | Branch | Network |
|-----|--------|--------|---------|
| dev | new.burcev.team | `dev` | `burcev_dev` |
| prod | burcev.team | `main` | `burcev_prod` |

## Требования на сервере

- Docker и Docker Compose v2
- `.env.dev` и `.env.prod` в `DEPLOY_PATH` (база Yandex Cloud, JWT, Supabase и т.д.)
- SSL-сертификаты Let's Encrypt: `/etc/letsencrypt/live/new.burcev.team/` и `/etc/letsencrypt/live/burcev.team/`
- Порты 80 и 443 свободны

## GitHub Secrets

| Secret | Описание |
|--------|----------|
| `DEPLOY_SSH_HOST` | IP или hostname сервера |
| `DEPLOY_SSH_USER` | SSH пользователь |
| `DEPLOY_SSH_PRIVATE_KEY` | Приватный SSH ключ (полностью, включая BEGIN/END) |
| `DEPLOY_PATH` | Путь на сервере (например `/opt/burcev`) |
| `DEPLOY_GHCR_USERNAME` | GitHub username для GHCR |
| `DEPLOY_GHCR_TOKEN` | Personal Access Token с `read:packages` |

## Структура на сервере

```
$DEPLOY_PATH/
├── .env.dev                  # Переменные окружения dev (DB, JWT, Supabase и т.д.)
├── .env.prod                 # Переменные окружения prod
├── docker-compose.server.yml # Копируется при деплое
└── .env.compose              # Создаётся при деплое (теги образов)
```

## Локальный запуск

```bash
# Сборка образов
docker build -t nginx -f deploy/nginx/Dockerfile deploy/nginx
docker build -t web -f apps/web/Dockerfile .
docker build -t api -f apps/api/Dockerfile apps/api

# Запуск (нужны .env.dev и .env.prod в deploy/)
cd deploy
NGINX_IMAGE=nginx WEB_DEV_IMAGE=web API_DEV_IMAGE=api \
  WEB_PROD_IMAGE=web API_PROD_IMAGE=api \
  docker compose -f docker-compose.server.yml up -d
```
