# Authentication Screen Design Document

## Overview

The authentication screen (`AUTH_MAIN_01`) is a Next.js client component that provides unified login and registration functionality with comprehensive legal consent management. Built using React 19 with the React Compiler, it integrates with the **Golang backend API** for authentication and implements a responsive, accessible interface following the Physical Life design system.

### Key Design Decisions

1. **Single Component Architecture**: Login and registration share the same form UI with conditional rendering for consent checkboxes, reducing code duplication and maintaining consistent UX
2. **Client Component**: Uses `'use client'` directive for form interactivity, state management, and API calls
3. **Golang Backend Integration**: All authentication requests go through the Golang API (`/api/v1/auth/login`, `/api/v1/auth/register`)
4. **JWT Token Management**: Stores JWT tokens from Golang backend in HTTP-only cookies for security
5. **Progressive Enhancement**: Core functionality works without JavaScript, enhanced with client-side validation

### Architecture Differences from Requirements

**Important Note**: The requirements document mentions Supabase, but the actual implementation uses:
- **Backend**: Golang API (`apps/api/`) with PostgreSQL (Yandex Cloud)
- **Authentication**: JWT tokens issued by Golang backend
- **No Supabase**: All auth logic handled by Golang service

## Architecture

### Component Hierarchy

```
AuthScreen (Client Component)
├── AuthHeader
│   ├── Logo
│   └── AppTitle
├── AuthForm
│   ├── EmailInput (with validation)
│   ├── PasswordInput (with visibility toggle)
│   ├── ForgotPasswordLink
│   └── ValidationErrors
├── ConsentSection (conditional on registration mode)
│   ├── ConsentCheckbox (terms_of_service) *
│   ├── ConsentCheckbox (privacy_policy) *
│   ├── ConsentCheckbox (data_processing) *
│   └── ConsentCheckbox (marketing)
├── ActionButtons
│   ├── LoginButton
│   └── RegisterButton
└── AuthFooter
    └── SupportLink

* = mandatory consent
```

### File Structure

```
apps/web/src/
├── app/
│   ├── auth/
│   │   ├── page.tsx                    # Auth screen route
│   │   └── layout.tsx                  # Auth layout (no nav)
│   └── middleware.ts                   # Auth redirect logic
├── features/
│   └── auth/
│       ├── components/
│       │   ├── AuthScreen.tsx          # Main auth component
│       │   ├── AuthForm.tsx            # Form inputs
│       │   ├── ConsentSection.tsx      # Consent checkboxes
│       │   ├── ConsentCheckbox.tsx     # Individual checkbox
│       │   ├── AuthFooter.tsx          # Footer with support link
│       │   └── index.ts                # Public exports
│       ├── hooks/
│       │   ├── useAuth.ts              # Auth state management
│       │   └── useFormValidation.ts    # Form validation logic
│       ├── api/
│       │   └── auth.ts                 # Auth API client functions
│       ├── types/
│       │   └── index.ts                # Auth-related TypeScript types
│       ├── utils/
│       │   └── validation.ts           # Zod validation schemas
│       └── index.ts                    # Feature public API
├── shared/
│   ├── components/
│   │   └── ui/
│   │       ├── Input.tsx               # Reusable input component
│   │       ├── Button.tsx              # Reusable button component
│   │       ├── Checkbox.tsx            # Reusable checkbox component
│   │       └── index.ts                # UI exports
│   ├── utils/
│   │   ├── api-client.ts               # HTTP client (fetch wrapper)
│   │   └── token-storage.ts           # JWT token management
│   └── types/
│       └── index.ts                    # Shared types
└── config/
    └── api.ts                          # API configuration (base URL, etc.)
```

## Components and Interfaces

### Core Types

```typescript
// features/auth/types/index.ts

export type AuthMode = 'login' | 'register';

export interface AuthFormData {
  email: string;
  password: string;
}

export interface ConsentState {
  terms_of_service: boolean;
  privacy_policy: boolean;
  data_processing: boolean;
  marketing: boolean;
}

// Response from Golang backend
export interface AuthResponse {
  user: {
    id: string;
    email: string;
    name?: string;
    role: 'client' | 'coordinator' | 'super_admin';
    created_at: string;
  };
  token: string; // JWT token
}

export interface AuthError {
  code: 'invalid_credentials' | 'user_exists' | 'network_error' | 'server_error' | 'validation_error';
  message: string;
  field?: 'email' | 'password' | 'consents';
}

export interface ValidationErrors {
  email?: string;
  password?: string;
  consents?: string;
}
```


### Validation Schema

```typescript
// features/auth/utils/validation.ts

import { z } from 'zod';

export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Invalid email format')
  .max(100, 'Email too long');

export const passwordSchema = z
  .string()
  .min(6, 'Password must be at least 6 characters')
  .max(128, 'Password too long');

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const consentSchema = z.object({
  terms_of_service: z.boolean(),
  privacy_policy: z.boolean(),
  data_processing: z.boolean(),
  marketing: z.boolean(),
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  consents: consentSchema.refine(
    (data) => data.terms_of_service && data.privacy_policy && data.data_processing,
    {
      message: 'All mandatory consents must be checked',
      path: ['consents'],
    }
  ),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
```

### API Client Functions

```typescript
// features/auth/api/auth.ts

import { apiClient } from '@/shared/utils/api-client';
import type { AuthFormData, ConsentState, AuthResponse, AuthError } from '@/features/auth/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function loginUser(data: AuthFormData): Promise<AuthResponse> {
  try {
    const response = await apiClient.post<AuthResponse>(`${API_BASE}/api/v1/auth/login`, {
      email: data.email,
      password: data.password,
    });

    return response;
  } catch (error: any) {
    throw mapApiError(error);
  }
}

export async function registerUser(
  data: AuthFormData,
  consents: ConsentState
): Promise<AuthResponse> {
  try {
    const response = await apiClient.post<AuthResponse>(`${API_BASE}/api/v1/auth/register`, {
      email: data.email,
      password: data.password,
      consents: consents,
    });

    return response;
  } catch (error: any) {
    throw mapApiError(error);
  }
}

function mapApiError(error: any): AuthError {
  // Network errors
  if (error.name === 'TypeError' || error.message?.includes('fetch')) {
    return {
      code: 'network_error',
      message: 'Check internet connection',
    };
  }

  // API error responses
  const status = error.response?.status;
  const message = error.response?.data?.message || error.message;

  if (status === 401 || message?.includes('Invalid credentials')) {
    return {
      code: 'invalid_credentials',
      message: 'Неверный логин или пароль',
    };
  }

  if (status === 409 || message?.includes('already exists')) {
    return {
      code: 'user_exists',
      message: 'Пользователь уже существует',
    };
  }

  if (status === 400) {
    return {
      code: 'validation_error',
      message: message || 'Invalid request data',
    };
  }

  if (status >= 500) {
    return {
      code: 'server_error',
      message: 'Сервис временно недоступен',
    };
  }

  return {
    code: 'server_error',
    message: 'Сервис временно недоступен',
  };
}
```

### HTTP Client Utility

```typescript
// shared/utils/api-client.ts

interface RequestOptions extends RequestInit {
  headers?: Record<string, string>;
}

class ApiClient {
  private async request<T>(url: string, options: RequestOptions = {}): Promise<T> {
    const token = this.getToken();
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error: any = new Error('API request failed');
      error.response = {
        status: response.status,
        data: await response.json().catch(() => ({})),
      };
      throw error;
    }

    const data = await response.json();
    return data.data || data; // Handle both {data: ...} and direct response
  }

  async get<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(url, { ...options, method: 'GET' });
  }

  async post<T>(url: string, body: any, options?: RequestOptions): Promise<T> {
    return this.request<T>(url, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async put<T>(url: string, body: any, options?: RequestOptions): Promise<T> {
    return this.request<T>(url, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async delete<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(url, { ...options, method: 'DELETE' });
  }

  private getToken(): string | null {
    // Get token from cookie or localStorage
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('auth_token');
  }

  setToken(token: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('auth_token', token);
  }

  clearToken(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('auth_token');
  }
}

export const apiClient = new ApiClient();
```

### Custom Hooks

```typescript
// features/auth/hooks/useAuth.ts

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginUser, registerUser } from '@/features/auth/api/auth';
import { apiClient } from '@/shared/utils/api-client';
import type { AuthFormData, ConsentState, AuthError } from '@/features/auth/types';
import { toast } from 'react-hot-toast';

export function useAuth() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);

  const login = async (data: AuthFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await loginUser(data);
      
      // Store JWT token
      apiClient.setToken(response.token);
      
      // Store user data in localStorage for quick access
      localStorage.setItem('user', JSON.stringify(response.user));
      
      toast.success('Вход выполнен успешно');
      router.push('/dashboard');
    } catch (err) {
      const authError = err as AuthError;
      setError(authError);
      toast.error(authError.message);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: AuthFormData, consents: ConsentState) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await registerUser(data, consents);
      
      // Store JWT token
      apiClient.setToken(response.token);
      
      // Store user data
      localStorage.setItem('user', JSON.stringify(response.user));
      
      toast.success('Регистрация успешна');
      router.push('/onboarding');
    } catch (err) {
      const authError = err as AuthError;
      setError(authError);
      toast.error(authError.message);
    } finally {
      setIsLoading(false);
    }
  };

  return { login, register, isLoading, error };
}
```

```typescript
// features/auth/hooks/useFormValidation.ts

import { useState, useCallback } from 'react';
import { loginSchema, registerSchema } from '@/features/auth/utils/validation';
import type { AuthFormData, ConsentState, ValidationErrors } from '@/features/auth/types';

export function useFormValidation() {
  const [errors, setErrors] = useState<ValidationErrors>({});

  const validateEmail = useCallback((email: string): boolean => {
    try {
      loginSchema.shape.email.parse(email);
      setErrors((prev) => ({ ...prev, email: undefined }));
      return true;
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, email: err.errors[0]?.message }));
      return false;
    }
  }, []);

  const validatePassword = useCallback((password: string): boolean => {
    try {
      loginSchema.shape.password.parse(password);
      setErrors((prev) => ({ ...prev, password: undefined }));
      return true;
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, password: err.errors[0]?.message }));
      return false;
    }
  }, []);

  const validateLogin = useCallback((data: AuthFormData): boolean => {
    try {
      loginSchema.parse(data);
      setErrors({});
      return true;
    } catch (err: any) {
      const validationErrors: ValidationErrors = {};
      err.errors.forEach((error: any) => {
        validationErrors[error.path[0] as keyof ValidationErrors] = error.message;
      });
      setErrors(validationErrors);
      return false;
    }
  }, []);

  const validateRegister = useCallback(
    (data: AuthFormData, consents: ConsentState): boolean => {
      try {
        registerSchema.parse({ ...data, consents });
        setErrors({});
        return true;
      } catch (err: any) {
        const validationErrors: ValidationErrors = {};
        err.errors.forEach((error: any) => {
          const field = error.path[0];
          if (field === 'consents') {
            validationErrors.consents = error.message;
          } else {
            validationErrors[field as keyof ValidationErrors] = error.message;
          }
        });
        setErrors(validationErrors);
        return false;
      }
    },
    []
  );

  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  return {
    errors,
    validateEmail,
    validatePassword,
    validateLogin,
    validateRegister,
    clearErrors,
  };
}
```


### Main Component

```typescript
// features/auth/components/AuthScreen.tsx

'use client';

import { useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useFormValidation } from '@/features/auth/hooks/useFormValidation';
import { AuthForm } from './AuthForm';
import { ConsentSection } from './ConsentSection';
import { AuthFooter } from './AuthFooter';
import type { AuthMode, AuthFormData, ConsentState } from '@/features/auth/types';

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [formData, setFormData] = useState<AuthFormData>({
    email: '',
    password: '',
  });
  const [consents, setConsents] = useState<ConsentState>({
    terms_of_service: false,
    privacy_policy: false,
    data_processing: false,
    marketing: false,
  });

  const { login, register, isLoading } = useAuth();
  const { errors, validateEmail, validatePassword, validateLogin, validateRegister } =
    useFormValidation();

  const handleEmailBlur = () => {
    if (formData.email) {
      validateEmail(formData.email);
    }
  };

  const handlePasswordBlur = () => {
    if (formData.password) {
      validatePassword(formData.password);
    }
  };

  const handleLogin = async () => {
    if (!validateLogin(formData)) {
      return;
    }
    await login(formData);
  };

  const handleRegister = async () => {
    if (!validateRegister(formData, consents)) {
      return;
    }
    await register(formData, consents);
  };

  const isFormValid = formData.email && formData.password;
  const isRegisterValid = isFormValid && 
    consents.terms_of_service && 
    consents.privacy_policy && 
    consents.data_processing;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="pt-8 pb-6 text-center">
        <div className="w-16 h-16 mx-auto mb-4">
          {/* Logo placeholder */}
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Physical Life</h1>
      </header>

      {/* Main Form */}
      <main className="flex-1 px-6 pb-6">
        <AuthForm
          formData={formData}
          setFormData={setFormData}
          errors={errors}
          onEmailBlur={handleEmailBlur}
          onPasswordBlur={handlePasswordBlur}
        />

        {/* Consent Section (Registration only) */}
        {mode === 'register' && (
          <ConsentSection
            consents={consents}
            setConsents={setConsents}
            error={errors.consents}
          />
        )}

        {/* Action Buttons */}
        <div className="mt-6 space-y-3">
          <button
            onClick={handleLogin}
            disabled={!isFormValid || isLoading}
            className="w-full py-3 bg-[#2A4BA0] text-white rounded-lg font-medium disabled:bg-[#D3D3D3] disabled:cursor-not-allowed transition-colors"
          >
            {isLoading && mode === 'login' ? 'Вход...' : 'Войти'}
          </button>

          <button
            onClick={handleRegister}
            disabled={!isRegisterValid || isLoading}
            className="w-full py-3 bg-white text-[#2A4BA0] border-2 border-[#2A4BA0] rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {isLoading && mode === 'register' ? 'Регистрация...' : 'Зарегистрироваться'}
          </button>
        </div>
      </main>

      {/* Footer */}
      <AuthFooter />
    </div>
  );
}
```

## State Management Design

### State Architecture

The authentication screen uses **local component state** with React hooks rather than global state management (Redux/Zustand) because:

1. **Ephemeral Nature**: Auth form data is temporary and doesn't need persistence
2. **Single Component Scope**: State is only needed within the auth screen
3. **Simple State Shape**: No complex nested state or cross-component dependencies
4. **Performance**: Local state with React Compiler optimization is sufficient

### State Flow Diagram

```
User Input → Form State → Validation → API Call → Navigation
     ↓           ↓            ↓           ↓           ↓
  onChange   useState    useFormVal   useAuth    useRouter
                                         ↓
                                    Golang API
                                         ↓
                                    JWT Token
                                         ↓
                                   localStorage
```

### State Management Patterns

1. **Form State**: Controlled components with `useState`
2. **Validation State**: Derived from form state via `useFormValidation` hook
3. **Loading State**: Boolean flag for async operations
4. **Error State**: Structured error objects with field-specific messages
5. **Consent State**: Separate object for checkbox state management

### State Persistence

- **No Form Data Storage**: Form data is not persisted (security best practice)
- **JWT Token Storage**: Stored in localStorage (accessible to JavaScript)
- **User Data**: Basic user info stored in localStorage for quick access
- **Navigation State**: Email can be passed to password reset via URL params

## Data Models

### Database Schema (PostgreSQL in Yandex Cloud)

```sql
-- Users table (managed by Golang backend)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('client', 'coordinator', 'super_admin')) DEFAULT 'client',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Consents table (audit trail)
CREATE TABLE user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('terms_of_service', 'privacy_policy', 'data_processing', 'marketing')),
  granted BOOLEAN NOT NULL,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_user_consents_user_id ON user_consents(user_id);
```

### Client-Side Data Models

```typescript
// Golang backend response types
export interface User {
  id: string;
  email: string;
  name?: string;
  role: 'client' | 'coordinator' | 'super_admin';
  created_at: string;
}

export interface LoginResponse {
  user: User;
  token: string; // JWT token
}

export interface RegisterResponse {
  user: User;
  token: string; // JWT token
}
```

## API Integration Patterns

### Golang Backend Integration

The frontend communicates with the Golang backend API running on port 4000 (development) or behind nginx (production).

### Authentication Flow

#### Login Flow

```
1. User submits email + password
2. Client-side validation (Zod schema)
3. POST /api/v1/auth/login to Golang backend
4. Golang validates credentials against PostgreSQL
5. On success: JWT token generated and returned
6. Frontend stores token in localStorage
7. Redirect to /dashboard
8. Middleware validates JWT on protected routes
```

#### Registration Flow

```
1. User submits email + password + consents
2. Client-side validation (Zod schema + consent check)
3. POST /api/v1/auth/register to Golang backend
4. Golang creates user in PostgreSQL
5. Golang stores consents in user_consents table
6. On success: JWT token generated, user auto-logged in
7. Frontend stores token in localStorage
8. Redirect to /onboarding
9. Middleware validates JWT
```

### API Endpoints

```
Base URL: http://localhost:4000 (dev) or https://api.burcev.team (prod)

POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

### Request/Response Examples

#### Login Request
```json
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure_password"
}
```

#### Login Response (Success)
```json
HTTP 200 OK
{
  "status": "success",
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "role": "client",
      "created_at": "2024-01-15T10:30:00Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### Login Response (Error)
```json
HTTP 401 Unauthorized
{
  "status": "error",
  "message": "Invalid credentials"
}
```

#### Register Request
```json
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure_password",
  "name": "John Doe",
  "consents": {
    "terms_of_service": true,
    "privacy_policy": true,
    "data_processing": true,
    "marketing": false
  }
}
```

#### Register Response (Success)
```json
HTTP 201 Created
{
  "status": "success",
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "client",
      "created_at": "2024-01-15T10:30:00Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### Register Response (Error - Duplicate)
```json
HTTP 409 Conflict
{
  "status": "error",
  "message": "User already exists"
}
```


## Validation Logic

### Validation Strategy

1. **Client-Side First**: Immediate feedback using Zod schemas
2. **On Blur**: Validate individual fields when user leaves input
3. **On Submit**: Full form validation before API call
4. **Server-Side**: Golang backend validates credentials and constraints

### Validation Rules

```typescript
// Email validation
- Required: Must not be empty
- Format: Must match email pattern (x@x.x)
- Length: Max 100 characters
- Trim: Remove leading/trailing whitespace

// Password validation
- Required: Must not be empty
- Length: Min 6 characters, max 128 characters
- No format restrictions (allows special chars, emoji)

// Consent validation (registration only)
- terms_of_service: Must be true
- privacy_policy: Must be true
- data_processing: Must be true
- marketing: Optional (can be false)
```

### Validation Timing

```typescript
// Validation timing strategy

interface ValidationTiming {
  // On input change: No validation (avoid annoying user)
  onChange: 'none';
  
  // On blur: Validate if field has value
  onBlur: 'validate-if-touched';
  
  // On submit: Full validation
  onSubmit: 'validate-all';
  
  // On error clear: When user starts correcting
  onErrorFix: 'clear-error';
}
```

### Validation Error Messages

```typescript
// Russian error messages

export const ERROR_MESSAGES = {
  email: {
    required: 'Введите email',
    invalid: 'Неверный формат email',
    tooLong: 'Email слишком длинный',
  },
  password: {
    required: 'Введите пароль',
    tooShort: 'Пароль должен содержать минимум 6 символов',
    tooLong: 'Пароль слишком длинный',
  },
  consents: {
    required: 'Необходимо принять обязательные соглашения',
  },
  api: {
    invalidCredentials: 'Неверный логин или пароль',
    userExists: 'Пользователь уже существует',
    networkError: 'Проверьте подключение к интернету',
    serverError: 'Сервис временно недоступен',
  },
} as const;
```

## Error Handling

### Error Boundary

```typescript
// app/auth/error.tsx

'use client';

import { useEffect } from 'react';
import { Button } from '@/shared/components/ui/Button';

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to monitoring service
    console.error('Auth screen error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Что-то пошло не так
        </h2>
        <p className="text-gray-600 mb-6">
          Произошла ошибка при загрузке страницы
        </p>
        <Button onClick={reset}>Попробовать снова</Button>
      </div>
    </div>
  );
}
```

### Network Error Detection

```typescript
// Network status monitoring

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

// Usage in AuthScreen
const isOnline = useNetworkStatus();

useEffect(() => {
  if (!isOnline) {
    toast.error('Check internet connection');
  }
}, [isOnline]);
```

### Error Handling Strategy

#### Error Categories

1. **Validation Errors**: Client-side, immediate feedback
2. **Network Errors**: Connection issues, timeouts
3. **Authentication Errors**: Invalid credentials, user exists
4. **Server Errors**: 500, 503, unexpected failures

#### Error Display Strategy

```typescript
// Error display patterns

// 1. Inline validation errors (below input fields)
<Input
  error={errors.email}
  helperText={errors.email}
/>

// 2. Toast notifications for API errors
toast.error('Неверный логин или пароль', {
  duration: 4000,
  position: 'top-center',
});

// 3. Consent validation errors (highlighted checkboxes)
<Checkbox
  error={errors.consents && !consents.terms_of_service}
  className={errors.consents ? 'border-red-500' : ''}
/>

// 4. Network errors (banner at top)
{networkError && (
  <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
    <p className="text-red-700">Check internet connection</p>
  </div>
)}
```

### Retry Logic

```typescript
// Exponential backoff for network errors

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      const isNetworkError = error instanceof TypeError;
      if (!isNetworkError) throw error;
      
      const delay = baseDelay * Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}

// Usage
const login = async (data: AuthFormData) => {
  try {
    await retryWithBackoff(() => loginUser(data));
  } catch (error) {
    // Handle final error
  }
};
```

### Logging Strategy

```typescript
// Centralized logging (can integrate with backend logger)

const logger = {
  info: (message: string, meta?: any) => {
    console.log(`[INFO] ${message}`, meta);
    // Send to backend logging service if needed
  },
  error: (message: string, meta?: any) => {
    console.error(`[ERROR] ${message}`, meta);
    // Send to backend logging service
  },
  debug: (message: string, meta?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[DEBUG] ${message}`, meta);
    }
  },
};

// Log authentication events
logger.info('User login attempt', { email: data.email });
logger.error('Login failed', { error: error.code, email: data.email });
logger.info('User registered', { userId: user.id });
```


## Correctness Properties

### What are Correctness Properties?

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

In this design, we define properties that can be validated through property-based testing, where each property is tested across many randomly generated inputs to ensure universal correctness.

### Property Reflection Analysis

After analyzing all acceptance criteria, I identified the following redundancies and consolidations:

**Redundancy Group 1: Button Disabled State**
- AC-1.3 (login button disabled when fields empty) and AC-2.5 (registration validates consents) can be combined into a single comprehensive property about form submission validation

**Redundancy Group 2: Error Message Display**
- AC-1.6, AC-2.8, AC-8.1, AC-9.1 all test error message display for different error types - these can be consolidated into one property about error mapping

**Redundancy Group 3: Input Validation**
- AC-5.1, AC-5.2, AC-5.3, AC-5.4 all test validation and error display - these can be combined into properties about validation logic and error UI state

**Redundancy Group 4: Navigation and State Preservation**
- AC-3.3 and AC-4.4 both test state preservation during navigation - can be combined into one property

**Consolidation Decisions:**
- Combine button state properties into one comprehensive form validation property
- Separate validation logic (pure functions) from UI error display (component behavior)
- Keep authentication flow properties separate (login vs register) as they have different success criteria
- Consolidate error message mapping into one property with different error types as test cases

### Properties

#### Property 1: Form Submission Validation
*For any* form state (email, password, consents), the submit buttons should be enabled/disabled according to validation rules: login requires non-empty email and password; registration additionally requires three mandatory consents to be checked.

**Validates: Requirements AC-1.3, AC-2.3, AC-2.5**

#### Property 2: Email Validation
*For any* string input, the email validation function should return true if and only if the string matches the email pattern (contains @ and at least one dot after @), is non-empty, and is at most 100 characters.

**Validates: Requirements AC-5.1, AC-2.2**

#### Property 3: Password Validation
*For any* string input, the password validation function should return true if and only if the string is at least 6 characters and at most 128 characters.

**Validates: Requirements AC-5.3, AC-2.2**

#### Property 4: Validation Error Clearing
*For any* field with a validation error, when the user enters valid input for that field, the error state for that field should be cleared while preserving errors for other fields.

**Validates: Requirements AC-5.5**

#### Property 5: Successful Login Flow
*For any* valid credentials (email and password that pass validation), when login succeeds (Golang API returns 200 with token), the user should be redirected to /dashboard and the JWT token should be stored in localStorage.

**Validates: Requirements AC-1.5**

#### Property 6: Successful Registration Flow
*For any* valid registration data (email, password, and all three mandatory consents checked), when registration succeeds (Golang API returns 201 with token), the user should be auto-logged in and redirected to /onboarding.

**Validates: Requirements AC-2.7**

#### Property 7: Authentication Error Mapping
*For any* Golang API authentication error, the error handler should map it to the correct user-facing error message: invalid credentials (401) → "Неверный логин или пароль", user exists (409) → "Пользователь уже существует", network error → "Check internet connection", server error (500+) → "Сервис временно недоступен".

**Validates: Requirements AC-1.6, AC-2.8, AC-8.1, AC-9.1**

#### Property 8: Consent Independence During Login
*For any* consent checkbox state (any combination of checked/unchecked), login submission should proceed without validating or checking consent state.

**Validates: Requirements AC-1.7**

#### Property 9: Marketing Consent Optionality
*For any* state of the marketing consent checkbox (checked or unchecked), registration should succeed if all other validation requirements are met (valid email, valid password, three mandatory consents checked).

**Validates: Requirements AC-2.4**

#### Property 10: Mandatory Consent Validation
*For any* registration attempt where at least one of the three mandatory consents (terms_of_service, privacy_policy, data_processing) is unchecked, the registration should be blocked and validation errors should be displayed.

**Validates: Requirements AC-2.3, AC-2.6**

#### Property 11: Loading State During Authentication
*For any* authentication request (login or register), from the moment the request is initiated until it completes (success or error), the corresponding button should display a loading state and be disabled.

**Validates: Requirements AC-1.4**

#### Property 12: State Preservation During Navigation
*For any* form data entered (email and password values), when the user navigates to password reset or legal document view and returns, the form data should be preserved.

**Validates: Requirements AC-3.3, AC-4.4**

#### Property 13: Error Message User-Friendliness
*For any* error that occurs in the system, the displayed error message should not contain technical details (stack traces, error codes, internal variable names) and should be in Russian language.

**Validates: Requirements AC-9.2**

#### Property 14: Error Logging
*For any* error that occurs (validation, network, authentication, server), a log entry should be created with appropriate severity level and context information.

**Validates: Requirements AC-9.4**

#### Property 15: Network Error Pre-emption
*For any* authentication attempt when the browser's navigator.onLine is false, the system should display the network error message without attempting the API call.

**Validates: Requirements AC-8.2**

#### Property 16: Validation Error UI State
*For any* field with a validation error, the corresponding input component should display an error indicator (red border or error message) and the error should be announced to screen readers.

**Validates: Requirements AC-5.2, AC-5.4, AC-2.6**

#### Property 17: Touch Target Minimum Size
*For all* interactive elements (buttons, checkboxes, links), the rendered dimensions should meet or exceed 44x44 pixels to ensure accessibility.

**Validates: Requirements AC-7.5**

### Example-Based Test Cases

The following scenarios should be tested with specific examples rather than property-based testing:

#### Example 1: Email Input Rendering
The auth form should render an input element with type="email" and appropriate labels for accessibility.

**Validates: Requirements AC-1.1, AC-2.1**

#### Example 2: Password Input Rendering
The auth form should render an input element with type="password" to mask characters.

**Validates: Requirements AC-1.2**

#### Example 3: Forgot Password Link
The auth form should render a clickable link with text "Забыл пароль?" that navigates to /auth/reset.

**Validates: Requirements AC-3.1, AC-3.2**

#### Example 4: Legal Document Links
The consent section should render clickable links for "Договор публичной оферты" and "Политика конфиденциальности" that open in WebView.

**Validates: Requirements AC-4.1, AC-4.2, AC-4.3, AC-4.5**

#### Example 5: Support Contact Link
The footer should render a clickable link "Связаться с нами" with mailto: href containing the support email.

**Validates: Requirements AC-6.1, AC-6.2, AC-6.3**

### Edge Cases

The following edge cases should be explicitly tested:

1. **Empty String Inputs**: Email and password fields with empty strings, whitespace-only strings
2. **Maximum Length Inputs**: Email at 100 characters, password at 128 characters
3. **Special Characters**: Passwords with emoji, Cyrillic characters, special symbols
4. **Rapid Clicking**: User clicks login/register button multiple times rapidly
5. **Concurrent State Changes**: User modifies input while API request is in flight
6. **Network Timeout**: API request exceeds 30-second timeout
7. **Session Expiry**: JWT token expires during form interaction
8. **Browser Back Button**: User navigates back after successful login


## Testing Strategy

### Dual Testing Approach

This feature requires both **unit tests** and **property-based tests** for comprehensive coverage:

- **Unit Tests**: Verify specific examples, edge cases, component rendering, and integration points
- **Property Tests**: Verify universal properties across randomly generated inputs

Both testing approaches are complementary and necessary. Unit tests catch concrete bugs and verify specific scenarios, while property tests verify general correctness across a wide input space.

### Property-Based Testing Configuration

**Library Selection**: We will use **fast-check** for property-based testing in TypeScript/JavaScript.

**Configuration Requirements**:
- Minimum 100 iterations per property test (due to randomization)
- Each property test must include a comment tag referencing the design property
- Tag format: `// Feature: auth-screen, Property {number}: {property_text}`

**Example Property Test Structure**:

```typescript
import fc from 'fast-check';

describe('Property 2: Email Validation', () => {
  it('should validate email format correctly for all inputs', () => {
    // Feature: auth-screen, Property 2: Email Validation
    fc.assert(
      fc.property(
        fc.string(),
        (input) => {
          const result = validateEmail(input);
          const hasAt = input.includes('@');
          const hasDotAfterAt = input.indexOf('.') > input.indexOf('@');
          const isValidLength = input.length > 0 && input.length <= 100;
          
          const shouldBeValid = hasAt && hasDotAfterAt && isValidLength;
          expect(result.isValid).toBe(shouldBeValid);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Unit Testing Strategy

**Test Organization**:
```
apps/web/__tests__/
├── unit/
│   └── features/
│       └── auth/
│           ├── AuthScreen.test.tsx          # Component rendering and integration
│           ├── AuthForm.test.tsx            # Form component behavior
│           ├── ConsentSection.test.tsx      # Consent checkbox logic
│           ├── validation.test.ts           # Validation functions (unit + property)
│           ├── auth-api.test.ts             # Auth API functions
│           ├── useAuth.test.ts              # Auth hook behavior
│           └── useFormValidation.test.ts    # Validation hook behavior
├── integration/
│   └── features/
│       └── auth/
│           └── auth-flow.test.tsx           # Full auth flow integration
└── e2e/
    └── auth.spec.ts                         # E2E auth scenarios
```

**Unit Test Focus Areas**:
1. **Component Rendering**: Verify all UI elements render correctly (Examples 1-5)
2. **Edge Cases**: Test boundary conditions (empty strings, max length, special chars)
3. **Error Conditions**: Test all error scenarios with specific error types
4. **Integration**: Test component interactions and data flow
5. **Accessibility**: Test ARIA labels, keyboard navigation, screen reader support

**Mock Strategy**:
- Mock Golang API using MSW (Mock Service Worker)
- Mock Next.js router for navigation testing
- Mock toast notifications for error display testing
- Mock network status for offline testing

### Test Coverage Goals

- **Line Coverage**: Minimum 80%
- **Branch Coverage**: Minimum 75%
- **Function Coverage**: Minimum 85%
- **Property Coverage**: 100% (all 17 properties must have tests)

### Testing Workflow

1. **Development**: Write tests alongside implementation (TDD encouraged)
2. **Pre-commit**: Run unit tests and linting
3. **CI Pipeline**: Run full test suite including property tests
4. **Coverage Report**: Generate and review coverage reports
5. **Property Test Failures**: When property test fails, add the failing case as a unit test

### Performance Testing

While not part of automated testing, the following performance criteria should be manually verified:

- Screen load time < 1 second
- Input validation response < 100ms
- API request timeout at 30 seconds
- No memory leaks during repeated login/register cycles

## Security Considerations

### Authentication Security

1. **Password Handling**:
   - Passwords never logged or stored in plain text on frontend
   - Password input masked by default (type="password")
   - Passwords sent over HTTPS only
   - Golang backend handles password hashing (bcrypt)

2. **Token Management**:
   - JWT tokens stored in localStorage (accessible to JavaScript)
   - **Note**: For production, consider HTTP-only cookies for better XSS protection
   - Tokens include expiration time (7 days default)
   - Token validation handled by Golang middleware

3. **Session Security**:
   - Session timeout configured in JWT (7 days default)
   - Logout clears token from localStorage
   - Expired tokens rejected by backend

### Input Validation Security

1. **XSS Prevention**:
   - React automatically escapes user input
   - No dangerouslySetInnerHTML used
   - Zod validation sanitizes input

2. **SQL Injection Prevention**:
   - Golang backend uses parameterized queries
   - No raw SQL from user input
   - PostgreSQL prepared statements

3. **CSRF Protection**:
   - API requests include Origin header
   - Golang backend validates request origin
   - Consider adding CSRF tokens for production

### Rate Limiting

```typescript
// Implement client-side rate limiting for auth attempts

class RateLimiter {
  private attempts: Map<string, number[]> = new Map();
  private readonly maxAttempts = 5;
  private readonly windowMs = 15 * 60 * 1000; // 15 minutes

  canAttempt(identifier: string): boolean {
    const now = Date.now();
    const attempts = this.attempts.get(identifier) || [];
    
    // Remove old attempts outside the window
    const recentAttempts = attempts.filter(time => now - time < this.windowMs);
    
    if (recentAttempts.length >= this.maxAttempts) {
      return false;
    }
    
    recentAttempts.push(now);
    this.attempts.set(identifier, recentAttempts);
    return true;
  }
}
```

**Note**: Backend should also implement rate limiting using Golang middleware.

## Accessibility

### WCAG 2.1 Compliance

Target: **Level AA** compliance

### Accessibility Features

1. **Keyboard Navigation**:
   - All interactive elements accessible via Tab key
   - Logical tab order (top to bottom, left to right)
   - Enter key submits form
   - Escape key closes modals/WebViews

2. **Screen Reader Support**:
   - All inputs have associated labels
   - Error messages announced via aria-live regions
   - Button states announced (loading, disabled)
   - Form validation errors announced

3. **Visual Accessibility**:
   - Color contrast ratio ≥ 4.5:1 for text
   - Focus indicators visible on all interactive elements
   - Error states not indicated by color alone
   - Touch targets ≥ 44x44 pixels

4. **ARIA Attributes**:

```typescript
// Example ARIA implementation

<input
  type="email"
  id="email"
  aria-label="Email address"
  aria-required="true"
  aria-invalid={!!errors.email}
  aria-describedby={errors.email ? 'email-error' : undefined}
/>

{errors.email && (
  <div id="email-error" role="alert" aria-live="polite">
    {errors.email}
  </div>
)}

<button
  type="submit"
  aria-label="Log in to your account"
  aria-busy={isLoading}
  disabled={!isFormValid || isLoading}
>
  {isLoading ? 'Вход...' : 'Войти'}
</button>
```

## Performance Optimization

### React Compiler Optimization

With React 19 Compiler enabled, the following optimizations are automatic:
- Memoization of component renders
- Automatic dependency tracking
- Optimized re-renders

### Manual Optimizations

1. **Code Splitting**:
```typescript
// Lazy load WebView component for legal documents
const LegalDocumentViewer = lazy(() => import('./LegalDocumentViewer'));
```

2. **Debounced Validation**:
```typescript
// Debounce validation to reduce re-renders
const debouncedValidate = useMemo(
  () => debounce(validateEmail, 300),
  []
);
```

3. **Optimistic UI Updates**:
```typescript
// Update UI immediately, rollback on error
const handleLogin = async () => {
  setIsLoading(true); // Immediate UI feedback
  try {
    await login(formData);
  } catch (error) {
    setIsLoading(false); // Rollback on error
  }
};
```

### Bundle Size Optimization

- Tree-shaking enabled for unused code
- API client loaded only when needed
- Icons loaded individually from lucide-react
- Zod schemas compiled at build time

## Deployment Considerations

### Environment Configuration

```bash
# Required environment variables
NEXT_PUBLIC_API_URL=http://localhost:4000  # Dev
NEXT_PUBLIC_API_URL=https://api.burcev.team  # Prod
NEXT_PUBLIC_APP_URL=https://burcev.team

# Optional
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_LOG_LEVEL=info
```

### Build Configuration

```typescript
// next.config.ts

const nextConfig = {
  experimental: {
    reactCompiler: true,
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  // ... other config
};

export default nextConfig;
```

### Middleware Configuration

```typescript
// app/middleware.ts

import { NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value || 
                request.headers.get('authorization')?.replace('Bearer ', '');
  
  const { pathname } = request.nextUrl;
  
  // Redirect authenticated users away from auth page
  if (pathname === '/auth' && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  
  // Protect dashboard routes
  if (pathname.startsWith('/dashboard') && !token) {
    return NextResponse.redirect(new URL('/auth', request.url));
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/auth', '/dashboard/:path*'],
};
```

## Future Enhancements

### Phase 2 Features (Post-MVP)

1. **Social Authentication**:
   - Google OAuth integration
   - Apple Sign In
   - VK authentication (Russian market)

2. **Biometric Authentication**:
   - Face ID / Touch ID support
   - WebAuthn integration

3. **Enhanced Security**:
   - Two-factor authentication (2FA)
   - Email verification requirement
   - Password strength meter
   - HTTP-only cookies for JWT storage

4. **UX Improvements**:
   - Remember me functionality
   - Auto-fill support
   - Password visibility toggle (eye icon)
   - Dark mode support

5. **Analytics**:
   - Conversion funnel tracking
   - A/B testing for registration flow
   - Error rate monitoring

### Technical Debt

Items to address in future iterations:

1. **Testing**: Increase property test coverage to 100%
2. **Accessibility**: Full WCAG 2.1 AAA compliance
3. **Performance**: Implement service worker for offline support
4. **Monitoring**: Add real-user monitoring (RUM)
5. **Documentation**: Add Storybook stories for all components
6. **Security**: Move JWT storage from localStorage to HTTP-only cookies

## Appendix

### Design System Reference

**Colors**:
- Primary: `#2A4BA0` (Royal Blue)
- Background: `#FFFFFF` (White)
- Input Background: `#E6E6FA` (Light Lavender)
- Error: `#FF0000` (Red)
- Disabled: `#D3D3D3` (Light Gray)

**Typography**:
- Font Family: System fonts (San Francisco on iOS, Roboto on Android)
- Heading: 24px, Bold
- Body: 16px, Regular
- Small: 14px, Regular

**Spacing**:
- Container Padding: 24px
- Element Spacing: 16px
- Input Height: 48px
- Button Height: 48px

**Border Radius**:
- Inputs: 8px
- Buttons: 8px
- Cards: 12px

### API Endpoint Reference

**Golang Backend Endpoints**:
- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/logout` - User logout
- `GET /api/v1/auth/me` - Get current user

**Custom Endpoints** (if needed):
- `POST /api/v1/consents` - Log consent acceptance
- `GET /api/v1/legal/terms` - Fetch terms of service
- `GET /api/v1/legal/privacy` - Fetch privacy policy

### Dependencies

```json
{
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-hot-toast": "^2.4.1",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@testing-library/react": "^14.1.2",
    "@testing-library/jest-dom": "^6.1.5",
    "@types/jest": "^29.5.11",
    "fast-check": "^3.15.0",
    "jest": "^29.7.0",
    "msw": "^2.0.11"
  }
}
```

### Glossary

- **Auth Screen**: The primary authentication interface (AUTH_MAIN_01)
- **Consent**: Legal agreement that user must accept
- **JWT**: JSON Web Token used for authentication
- **Golang Backend**: Go API server handling business logic
- **PostgreSQL**: Database hosted in Yandex Cloud
- **WebView**: In-app browser component
- **Zod**: TypeScript-first schema validation library
- **MSW**: Mock Service Worker for API mocking in tests
