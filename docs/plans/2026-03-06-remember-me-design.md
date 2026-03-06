# Design: "Remember Me" (Запомнить меня)

## Problem

Refresh token всегда живёт 30 дней. Пользователь не может выбрать короткую сессию. Нужна опция "Запомнить меня" на форме логина, которая управляет временем жизни refresh token.

## Solution

Добавить чекбокс "Запомнить меня" на форму логина (не регистрации). Передавать флаг `remember_me` в POST /auth/login. Бэкенд выбирает TTL refresh token на основе флага.

## Token Lifetimes

| Режим | Access token | Refresh token |
|-------|-------------|---------------|
| Без "Запомнить меня" | 15 мин | 24 часа |
| С "Запомнить меня" | 15 мин | 30 дней |

Access token не меняется. Auto-refresh механизм не меняется.

## Refresh Token Rotation

При refresh rotation новый refresh token **наследует** `remember_me` флаг от старого. Для этого флаг хранится в таблице `refresh_tokens`.

## Changes

### Database — migration 037

Добавить колонку `remember_me BOOLEAN NOT NULL DEFAULT false` в таблицу `refresh_tokens`.

### Backend (apps/api)

**handler.go:**
- Добавить `RememberMe bool` в `LoginRequest`
- Прокинуть в `service.Login()`

**service.go:**
- Константы:
  ```go
  RefreshTokenTTLDefault    = 24 * time.Hour
  RefreshTokenTTLRememberMe = 30 * 24 * time.Hour
  ```
- `Login()` — принимает `rememberMe bool`, передаёт в `generateRefreshToken()`
- `generateRefreshToken()` — принимает `rememberMe bool`, выбирает TTL, записывает флаг в БД
- `RefreshToken()` — читает `remember_me` из старого токена, передаёт при создании нового

### Frontend (apps/web)

**auth.ts (API client):**
- `loginUser()` принимает и отправляет `remember_me`

**AuthForm.tsx (или LoginForm.tsx):**
- Чекбокс "Запомнить меня" под полем пароля, только на вкладке логина
- По умолчанию выключен

**Хук/стор авторизации:**
- Прокинуть `rememberMe` из формы в API-вызов

## What Does NOT Change

- Access token TTL (15 мин)
- Auto-refresh механизм на фронте
- Endpoint POST /auth/refresh (API контракт)
- Регистрация — без чекбокса, refresh token = 24 часа (default)
