# Руководство по тестированию

## Обзор

Проект использует комплексную систему тестирования с минимальным покрытием 80% для frontend и backend.

## Структура тестов

```
apps/
├── web/                                    # Frontend тесты
│   ├── src/
│   │   ├── features/
│   │   │   └── auth/__tests__/            # Тесты компонентов фич
│   │   └── shared/
│   │       ├── hooks/__tests__/           # Тесты хуков
│   │       └── utils/__tests__/           # Тесты утилит
│   ├── __mocks__/                         # MSW моки
│   ├── jest.config.js                     # Конфигурация Jest
│   └── jest.setup.js                      # Настройка тестового окружения
│
└── api/                                    # Backend тесты
    └── internal/
        ├── modules/
        │   └── auth/
        │       ├── handler_test.go        # Тесты HTTP handlers
        │       └── service_test.go        # Тесты бизнес-логики
        └── shared/
            └── middleware/
                └── auth_test.go           # Тесты middleware
```

## Frontend тестирование

### Технологии

- **Jest** - test runner
- **React Testing Library** - тестирование компонентов
- **MSW (Mock Service Worker)** - мокирование API
- **@testing-library/user-event** - симуляция действий пользователя

### Запуск тестов

```bash
# Все тесты
npm run test:web

# Watch режим
cd apps/web && npm run test:watch

# С покрытием
npm run test:coverage:web

# CI режим (с проверкой порога 80%)
npm run test:coverage:ci
```

### Примеры тестов

#### Тестирование компонента

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginForm } from '../LoginForm'

describe('LoginForm', () => {
  it('validates email format', async () => {
    const user = userEvent.setup()
    render(<LoginForm />)
    
    const emailInput = screen.getByLabelText(/email/i)
    await user.type(emailInput, 'invalid-email')
    await user.tab()
    
    await waitFor(() => {
      expect(screen.getByText(/некорректный email/i)).toBeInTheDocument()
    })
  })
})
```

#### Тестирование хука

```typescript
import { renderHook, waitFor } from '@testing-library/react'
import { useAuth } from '../useAuth'

describe('useAuth', () => {
  it('loads user data on mount', async () => {
    const { result } = renderHook(() => useAuth())
    
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    
    expect(result.current.user).toBeTruthy()
  })
})
```

#### Тестирование утилит

```typescript
import { validateEmail } from '../validation'

describe('validateEmail', () => {
  it('validates correct email addresses', () => {
    expect(validateEmail('test@example.com')).toBe(true)
  })

  it('rejects invalid email addresses', () => {
    expect(validateEmail('invalid')).toBe(false)
  })
})
```

### MSW моки

Моки API находятся в `apps/web/__mocks__/handlers.ts`:

```typescript
import { http, HttpResponse } from 'msw'

export const handlers = [
  http.post('/auth/login', async ({ request }) => {
    const body = await request.json()
    
    if (body.email === 'test@example.com') {
      return HttpResponse.json({
        status: 'success',
        data: { user: { id: '1', email: body.email } }
      })
    }
    
    return HttpResponse.json(
      { status: 'error', message: 'Invalid credentials' },
      { status: 401 }
    )
  }),
]
```

## Backend тестирование

### Технологии

- **Go testing** - встроенный test runner
- **testify** - assertions и моки
- **httptest** - тестирование HTTP handlers
- **Benchmarks** - тесты производительности

### Запуск тестов

```bash
# Все тесты
npm run test:api
# или
cd apps/api && make test

# С покрытием
cd apps/api && make test-coverage

# HTML отчет покрытия
cd apps/api && make test-coverage-html

# CI режим (с проверкой порога 80%)
cd apps/api && make test-coverage-ci

# Бенчмарки
cd apps/api && make bench
```

### Примеры тестов

#### Тестирование handler

```go
func TestRegister(t *testing.T) {
    handler := setupTestHandler()
    
    tests := []struct {
        name           string
        payload        RegisterRequest
        expectedStatus int
    }{
        {
            name: "successful registration",
            payload: RegisterRequest{
                Email:    "test@example.com",
                Password: "password123",
            },
            expectedStatus: http.StatusCreated,
        },
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            w := httptest.NewRecorder()
            c, _ := gin.CreateTestContext(w)
            
            body, _ := json.Marshal(tt.payload)
            c.Request = httptest.NewRequest(
                http.MethodPost, 
                "/auth/register", 
                bytes.NewBuffer(body),
            )
            
            handler.Register(c)
            
            assert.Equal(t, tt.expectedStatus, w.Code)
        })
    }
}
```

#### Тестирование service

```go
func TestLoginService(t *testing.T) {
    service := setupTestService()
    ctx := context.Background()
    
    result, err := service.Login(ctx, "test@example.com", "password123")
    
    assert.NoError(t, err)
    assert.NotNil(t, result)
    assert.NotEmpty(t, result.Token)
}
```

#### Benchmark тесты

```go
func BenchmarkGenerateToken(b *testing.B) {
    service := setupTestService()
    user := &User{ID: "user-123", Email: "test@example.com"}
    
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        _, _ = service.generateToken(user)
    }
}
```

## Pre-commit хуки

Система использует Husky для автоматических проверок перед коммитом.

### Что проверяется

**Frontend (если изменены файлы в `apps/web/`):**
- ✅ TypeScript type checking
- ✅ ESLint (только измененные файлы)
- ✅ Jest тесты (только связанные с изменениями)

**Backend (если изменены файлы в `apps/api/`):**
- ✅ Go fmt проверка
- ✅ Go тесты (только измененные пакеты)

### Установка хуков

```bash
# Автоматически при npm install
npm install

# Или вручную
npm run prepare
```

### Пропуск хуков (не рекомендуется)

```bash
git commit --no-verify -m "message"
```

## CI Pipeline

### Джобы

1. **frontend-tests**
   - Type checking
   - Linting
   - Unit/integration тесты
   - Проверка покрытия ≥80%

2. **backend-tests**
   - Go fmt проверка
   - Unit/integration тесты
   - Проверка покрытия ≥80%

3. **security-audit**
   - npm audit
   - gosec сканирование

4. **build-check**
   - Сборка frontend
   - Сборка backend
   - Сохранение артефактов

### Локальный запуск всех проверок

```bash
# Frontend
npm run type-check
npm run lint:web
npm run test:coverage:web

# Backend
cd apps/api
make fmt
make test-coverage
make lint
```

## Покрытие кода

### Требования

- **Минимум 80%** для всех метрик:
  - Branches (ветвления)
  - Functions (функции)
  - Lines (строки)
  - Statements (выражения)

### Просмотр покрытия

**Frontend:**
```bash
npm run test:coverage:web
# Откроется apps/web/coverage/lcov-report/index.html
```

**Backend:**
```bash
cd apps/api
make test-coverage-html
# Откроется coverage.html
```

### Исключения из покрытия

**Frontend (jest.config.js):**
- `*.d.ts` - файлы типов
- `*.stories.*` - Storybook stories
- `__tests__/**` - сами тесты

**Backend:**
- Файлы `*_test.go` автоматически исключаются

## Best Practices

### Frontend

1. **Используйте Testing Library queries в правильном порядке:**
   - `getByRole` (предпочтительно)
   - `getByLabelText`
   - `getByPlaceholderText`
   - `getByText`
   - `getByTestId` (последний вариант)

2. **Тестируйте поведение, а не реализацию:**
   ```typescript
   // ✅ Хорошо
   expect(screen.getByRole('button')).toBeDisabled()
   
   // ❌ Плохо
   expect(component.state.isLoading).toBe(true)
   ```

3. **Используйте userEvent вместо fireEvent:**
   ```typescript
   // ✅ Хорошо
   await user.click(button)
   
   // ❌ Плохо
   fireEvent.click(button)
   ```

4. **Ждите асинхронных изменений:**
   ```typescript
   await waitFor(() => {
     expect(screen.getByText('Success')).toBeInTheDocument()
   })
   ```

### Backend

1. **Используйте table-driven тесты:**
   ```go
   tests := []struct {
       name string
       input string
       want string
   }{
       {"case 1", "input1", "output1"},
       {"case 2", "input2", "output2"},
   }
   ```

2. **Изолируйте тесты:**
   - Каждый тест должен быть независимым
   - Используйте `t.Parallel()` где возможно
   - Очищайте состояние после тестов

3. **Используйте testify для assertions:**
   ```go
   assert.Equal(t, expected, actual)
   assert.NoError(t, err)
   assert.NotNil(t, result)
   ```

4. **Добавляйте бенчмарки для критичных функций:**
   ```go
   func BenchmarkCriticalFunction(b *testing.B) {
       for i := 0; i < b.N; i++ {
           CriticalFunction()
       }
   }
   ```

## Troubleshooting

### Frontend

**Проблема:** Тесты падают с timeout
```bash
# Увеличьте timeout в jest.config.js
testTimeout: 10000
```

**Проблема:** MSW не перехватывает запросы
```bash
# Проверьте, что server запущен в jest.setup.js
import { server } from './__mocks__/server'
beforeAll(() => server.listen())
```

### Backend

**Проблема:** Тесты не находятся
```bash
# Убедитесь, что файлы заканчиваются на _test.go
mv test_auth.go auth_test.go
```

**Проблема:** Низкое покрытие
```bash
# Посмотрите детальный отчет
go tool cover -func=coverage.out
```

## Дополнительные ресурсы

- [Jest Documentation](https://jestjs.io/)
- [React Testing Library](https://testing-library.com/react)
- [MSW Documentation](https://mswjs.io/)
- [Go Testing](https://golang.org/pkg/testing/)
- [Testify](https://github.com/stretchr/testify)
