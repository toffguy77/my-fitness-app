# Docker Deployment Guide

## Быстрый старт

### 1. Подготовка переменных окружения

Создайте файл `.env.production` на основе `.env.example`:

```bash
cp .env.example .env.production
```

Заполните переменные:
- `NEXT_PUBLIC_SUPABASE_URL` - URL вашего Supabase проекта
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Anon key из Supabase

### 2. Сборка Docker образа

```bash
docker build -t my-fitness-app .
```

### 3. Запуск контейнера

#### Вариант 1: Docker Compose (рекомендуется)

```bash
docker-compose up -d
```

#### Вариант 2: Docker напрямую

```bash
docker run -d \
  -p 3069:3069 \
  --env-file .env.production \
  --name my-fitness-app \
  my-fitness-app
```

### 4. Проверка

Откройте браузер: http://localhost:3069

## Production Deployment

### На сервере

1. Клонируйте репозиторий:
```bash
git clone git@github.com:toffguy77/my-fitness-app.git
cd my-fitness-app
```

2. Создайте `.env.production` с переменными окружения

3. Запустите через Docker Compose:
```bash
docker-compose up -d --build
```

### Обновление приложения

```bash
git pull
docker-compose up -d --build
```

### Просмотр логов

```bash
docker-compose logs -f app
```

### Остановка

```bash
docker-compose down
```

## Оптимизация

### Multi-stage build

Dockerfile использует multi-stage build для минимизации размера образа:
- `deps` - установка зависимостей
- `builder` - сборка приложения
- `runner` - production образ (только необходимые файлы)

### Standalone output

Next.js настроен на `output: 'standalone'` для создания минимального production образа.

## Troubleshooting

### Проблема: Приложение не запускается

1. Проверьте логи: `docker-compose logs app`
2. Убедитесь, что переменные окружения установлены
3. Проверьте, что порт 3069 свободен

### Проблема: Ошибки подключения к Supabase

1. Проверьте `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY`
2. Убедитесь, что Supabase проект активен
3. Проверьте RLS policies в Supabase

## Production Best Practices

1. **Используйте reverse proxy** (nginx/traefik) перед приложением
2. **Настройте SSL/TLS** через Let's Encrypt
3. **Используйте secrets management** для переменных окружения
4. **Настройте мониторинг** и логирование
5. **Регулярно обновляйте** зависимости и образы

## Пример с Nginx

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3069;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

