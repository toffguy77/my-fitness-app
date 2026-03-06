# Test Coverage Improvement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Raise test coverage from ~50% to 80-90%+ with quality unit and integration tests across all untested features.

**Architecture:** Systematic feature-by-feature approach. Within each feature: store → hooks → API → components. Follow existing patterns (fast-check generators, jest.mock, userEvent, renderHook). Each task produces a working commit with passing tests.

**Tech Stack:** Jest, React Testing Library, fast-check, userEvent, Go sqlmock, testify

**Branch:** `feat/test-coverage-improvement` (from `dev`)

---

## Task 1: Create branch and verify baseline

**Files:**
- None

**Step 1: Create feature branch**

```bash
cd /Users/thatguy/src/my-fitness-app
git checkout dev
git checkout -b feat/test-coverage-improvement
```

**Step 2: Run existing tests and capture baseline coverage**

```bash
cd apps/web && npx jest --coverage --silent 2>&1 | tail -20
cd ../api && go test ./... -count=1 2>&1 | tail -10
```

**Step 3: Commit branch creation marker**

No commit needed — branch itself is the marker.

---

## Task 2: Onboarding — store tests

**Files:**
- Create: `apps/web/src/features/onboarding/store/__tests__/onboardingStore.test.ts`

**Step 1: Write store tests**

Test the Zustand store — step navigation bounds, all setters, reset, initial state.

```typescript
import { renderHook, act } from '@testing-library/react'
import { useOnboardingStore } from '../onboardingStore'

describe('useOnboardingStore', () => {
  beforeEach(() => {
    act(() => {
      useOnboardingStore.getState().reset()
    })
  })

  describe('initial state', () => {
    it('starts at step 0 with 5 total steps', () => {
      const { result } = renderHook(() => useOnboardingStore())
      expect(result.current.currentStep).toBe(0)
      expect(result.current.totalSteps).toBe(5)
    })

    it('has default values for all fields', () => {
      const { result } = renderHook(() => useOnboardingStore())
      expect(result.current.language).toBe('ru')
      expect(result.current.units).toBe('metric')
      expect(result.current.activityLevel).toBe('moderate')
      expect(result.current.fitnessGoal).toBe('maintain')
      expect(result.current.avatarUrl).toBe('')
      expect(result.current.birthDate).toBe('')
      expect(result.current.biologicalSex).toBe('')
      expect(result.current.appleHealthEnabled).toBe(false)
    })
  })

  describe('step navigation', () => {
    it('nextStep increments currentStep', () => {
      const { result } = renderHook(() => useOnboardingStore())
      act(() => { result.current.nextStep() })
      expect(result.current.currentStep).toBe(1)
    })

    it('nextStep does not exceed totalSteps - 1', () => {
      const { result } = renderHook(() => useOnboardingStore())
      for (let i = 0; i < 10; i++) {
        act(() => { result.current.nextStep() })
      }
      expect(result.current.currentStep).toBe(4)
    })

    it('prevStep decrements currentStep', () => {
      const { result } = renderHook(() => useOnboardingStore())
      act(() => { result.current.setStep(3) })
      act(() => { result.current.prevStep() })
      expect(result.current.currentStep).toBe(2)
    })

    it('prevStep does not go below 0', () => {
      const { result } = renderHook(() => useOnboardingStore())
      act(() => { result.current.prevStep() })
      expect(result.current.currentStep).toBe(0)
    })

    it('setStep sets arbitrary step', () => {
      const { result } = renderHook(() => useOnboardingStore())
      act(() => { result.current.setStep(3) })
      expect(result.current.currentStep).toBe(3)
    })
  })

  describe('setters', () => {
    it('setLanguage updates language', () => {
      const { result } = renderHook(() => useOnboardingStore())
      act(() => { result.current.setLanguage('en') })
      expect(result.current.language).toBe('en')
    })

    it('setUnits updates units', () => {
      const { result } = renderHook(() => useOnboardingStore())
      act(() => { result.current.setUnits('imperial') })
      expect(result.current.units).toBe('imperial')
    })

    it('setBiologicalSex updates sex', () => {
      const { result } = renderHook(() => useOnboardingStore())
      act(() => { result.current.setBiologicalSex('male') })
      expect(result.current.biologicalSex).toBe('male')
    })

    it('setFitnessGoal updates goal', () => {
      const { result } = renderHook(() => useOnboardingStore())
      act(() => { result.current.setFitnessGoal('loss') })
      expect(result.current.fitnessGoal).toBe('loss')
    })

    it('setAppleHealth updates apple health', () => {
      const { result } = renderHook(() => useOnboardingStore())
      act(() => { result.current.setAppleHealth(true) })
      expect(result.current.appleHealthEnabled).toBe(true)
    })

    it('setAvatarUrl updates avatar', () => {
      const { result } = renderHook(() => useOnboardingStore())
      act(() => { result.current.setAvatarUrl('https://example.com/avatar.jpg') })
      expect(result.current.avatarUrl).toBe('https://example.com/avatar.jpg')
    })
  })

  describe('reset', () => {
    it('resets all state to initial values', () => {
      const { result } = renderHook(() => useOnboardingStore())
      act(() => {
        result.current.setStep(3)
        result.current.setLanguage('en')
        result.current.setBiologicalSex('male')
        result.current.setFitnessGoal('loss')
      })
      act(() => { result.current.reset() })
      expect(result.current.currentStep).toBe(0)
      expect(result.current.language).toBe('ru')
      expect(result.current.biologicalSex).toBe('')
      expect(result.current.fitnessGoal).toBe('maintain')
    })
  })
})
```

**Step 2: Run tests**

```bash
cd apps/web && npx jest src/features/onboarding/store/__tests__/onboardingStore.test.ts --verbose
```

**Step 3: Commit**

```bash
git add apps/web/src/features/onboarding/store/__tests__/
git commit -m "test(onboarding): add store unit tests"
```

---

## Task 3: Onboarding — StepIndicator component tests

**Files:**
- Create: `apps/web/src/features/onboarding/components/__tests__/StepIndicator.test.tsx`

**Step 1: Write component tests**

```typescript
import { render, screen } from '@testing-library/react'
import { StepIndicator } from '../StepIndicator'

describe('StepIndicator', () => {
  it('renders correct number of dots', () => {
    const { container } = render(<StepIndicator currentStep={0} totalSteps={5} />)
    const dots = container.querySelectorAll('.rounded-full')
    expect(dots).toHaveLength(5)
  })

  it('renders connecting lines between dots (totalSteps - 1)', () => {
    const { container } = render(<StepIndicator currentStep={0} totalSteps={5} />)
    const lines = container.querySelectorAll('.h-0\\.5')
    expect(lines).toHaveLength(4)
  })

  it('highlights completed and active steps with blue', () => {
    const { container } = render(<StepIndicator currentStep={2} totalSteps={5} />)
    const dots = container.querySelectorAll('.rounded-full')
    // Steps 0, 1 (completed) and 2 (active) should be blue
    expect(dots[0]).toHaveClass('bg-blue-600')
    expect(dots[1]).toHaveClass('bg-blue-600')
    expect(dots[2]).toHaveClass('bg-blue-600')
    // Steps 3, 4 should be gray
    expect(dots[3]).toHaveClass('bg-gray-300')
    expect(dots[4]).toHaveClass('bg-gray-300')
  })

  it('highlights connecting lines for completed steps', () => {
    const { container } = render(<StepIndicator currentStep={2} totalSteps={5} />)
    const lines = container.querySelectorAll('.h-0\\.5')
    expect(lines[0]).toHaveClass('bg-blue-600')
    expect(lines[1]).toHaveClass('bg-blue-600')
    expect(lines[2]).toHaveClass('bg-gray-300')
    expect(lines[3]).toHaveClass('bg-gray-300')
  })

  it('renders correctly at first step', () => {
    const { container } = render(<StepIndicator currentStep={0} totalSteps={3} />)
    const dots = container.querySelectorAll('.rounded-full')
    expect(dots[0]).toHaveClass('bg-blue-600')
    expect(dots[1]).toHaveClass('bg-gray-300')
    expect(dots[2]).toHaveClass('bg-gray-300')
  })

  it('renders correctly at last step', () => {
    const { container } = render(<StepIndicator currentStep={4} totalSteps={5} />)
    const dots = container.querySelectorAll('.rounded-full')
    dots.forEach(dot => {
      expect(dot).toHaveClass('bg-blue-600')
    })
  })
})
```

**Step 2: Run tests**

```bash
cd apps/web && npx jest src/features/onboarding/components/__tests__/StepIndicator.test.tsx --verbose
```

**Step 3: Commit**

```bash
git add apps/web/src/features/onboarding/components/__tests__/
git commit -m "test(onboarding): add StepIndicator component tests"
```

---

## Task 4: Onboarding — OnboardingWizard component tests

**Files:**
- Create: `apps/web/src/features/onboarding/components/__tests__/OnboardingWizard.test.tsx`

**Step 1: Write wizard tests**

Mock dependencies: router, toast, settings API, onboarding API. Test step rendering, navigation, API calls, error handling.

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { OnboardingWizard } from '../OnboardingWizard'
import { useOnboardingStore } from '../../store/onboardingStore'
import * as settingsApi from '@/features/settings/api/settings'
import * as onboardingApi from '../../api/onboarding'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), { error: jest.fn() }),
}))
jest.mock('@/features/settings/api/settings')
jest.mock('../../api/onboarding')
jest.mock('@/shared/components/settings', () => ({
  PhotoUploader: ({ onUpload }: any) => <div data-testid="photo-uploader" onClick={() => onUpload?.(new File([], 'test.jpg'))}>PhotoUploader</div>,
  LanguageSelector: ({ value, onChange }: any) => <select data-testid="language-selector" value={value} onChange={(e) => onChange(e.target.value)}><option value="ru">RU</option><option value="en">EN</option></select>,
  UnitSelector: ({ value, onChange }: any) => <div data-testid="unit-selector">{value}</div>,
  TimezoneSelector: ({ value, onChange }: any) => <div data-testid="timezone-selector">{value}</div>,
  SocialAccountsForm: () => <div data-testid="social-form">Social</div>,
  AppleHealthToggle: ({ enabled, onChange }: any) => <div data-testid="apple-health">{String(enabled)}</div>,
}))

const mockPush = jest.fn()
const mockGetProfile = settingsApi.getProfile as jest.MockedFunction<typeof settingsApi.getProfile>
const mockUpdateSettings = settingsApi.updateSettings as jest.MockedFunction<typeof settingsApi.updateSettings>
const mockUploadAvatar = settingsApi.uploadAvatar as jest.MockedFunction<typeof settingsApi.uploadAvatar>
const mockCompleteOnboarding = onboardingApi.completeOnboarding as jest.MockedFunction<typeof onboardingApi.completeOnboarding>

describe('OnboardingWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue({ push: mockPush })
    localStorage.setItem('auth_token', 'test-token')
    mockGetProfile.mockResolvedValue({ id: 1, email: 'test@test.com', name: 'Test', role: 'client', avatar_url: '', onboarding_completed: false, settings: {} } as any)
    mockUpdateSettings.mockResolvedValue(undefined as any)
    mockCompleteOnboarding.mockResolvedValue(undefined)
    mockUploadAvatar.mockResolvedValue('https://example.com/avatar.jpg')
    useOnboardingStore.getState().reset()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('renders step 0 (photo) by default', () => {
    render(<OnboardingWizard />)
    expect(screen.getByText('Фото профиля')).toBeInTheDocument()
    expect(screen.getByTestId('photo-uploader')).toBeInTheDocument()
  })

  it('redirects to /auth if no token', () => {
    localStorage.removeItem('auth_token')
    render(<OnboardingWizard />)
    expect(mockPush).toHaveBeenCalledWith('/auth')
  })

  it('shows "Далее" button on non-last steps', () => {
    render(<OnboardingWizard />)
    expect(screen.getByText('Далее')).toBeInTheDocument()
  })

  it('shows "Пропустить" button', () => {
    render(<OnboardingWizard />)
    expect(screen.getByText('Пропустить')).toBeInTheDocument()
  })

  it('navigates to next step on "Далее" click', async () => {
    const user = userEvent.setup()
    render(<OnboardingWizard />)
    await user.click(screen.getByText('Далее'))
    await waitFor(() => {
      expect(screen.getByText('Настройки')).toBeInTheDocument()
    })
  })

  it('skips step on "Пропустить" click', async () => {
    const user = userEvent.setup()
    render(<OnboardingWizard />)
    await user.click(screen.getByText('Пропустить'))
    expect(screen.getByText('Настройки')).toBeInTheDocument()
  })

  it('calls updateSettings when navigating from step 1', async () => {
    const user = userEvent.setup()
    useOnboardingStore.getState().setStep(1)
    render(<OnboardingWizard />)
    await user.click(screen.getByText('Далее'))
    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalled()
    })
  })

  it('calls completeOnboarding on last step', async () => {
    const user = userEvent.setup()
    useOnboardingStore.getState().setStep(4)
    render(<OnboardingWizard />)
    expect(screen.getByText('Завершить')).toBeInTheDocument()
    await user.click(screen.getByText('Завершить'))
    await waitFor(() => {
      expect(mockCompleteOnboarding).toHaveBeenCalled()
      expect(mockPush).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('shows error toast on API failure', async () => {
    const user = userEvent.setup()
    useOnboardingStore.getState().setStep(1)
    mockUpdateSettings.mockRejectedValueOnce(new Error('fail'))
    render(<OnboardingWizard />)
    await user.click(screen.getByText('Далее'))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Не удалось сохранить. Попробуйте ещё раз.')
    })
  })
})
```

**Step 2: Run tests**

```bash
cd apps/web && npx jest src/features/onboarding/components/__tests__/OnboardingWizard.test.tsx --verbose
```

**Step 3: Commit**

```bash
git add apps/web/src/features/onboarding/components/__tests__/
git commit -m "test(onboarding): add OnboardingWizard component tests"
```

---

## Task 5: Onboarding — API tests

**Files:**
- Create: `apps/web/src/features/onboarding/api/__tests__/onboarding.test.ts`

**Step 1: Write API tests**

```typescript
import { completeOnboarding } from '../onboarding'
import { apiClient } from '@/shared/utils/api-client'

jest.mock('@/shared/utils/api-client', () => ({
  apiClient: {
    put: jest.fn(),
  },
}))

const mockPut = apiClient.put as jest.MockedFunction<typeof apiClient.put>

describe('completeOnboarding', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls PUT /backend-api/v1/users/onboarding/complete', async () => {
    mockPut.mockResolvedValue(undefined as any)
    await completeOnboarding()
    expect(mockPut).toHaveBeenCalledWith('/backend-api/v1/users/onboarding/complete', {})
  })

  it('propagates API errors', async () => {
    mockPut.mockRejectedValue(new Error('Network error'))
    await expect(completeOnboarding()).rejects.toThrow('Network error')
  })
})
```

**Step 2: Run and commit**

```bash
cd apps/web && npx jest src/features/onboarding/api/__tests__/onboarding.test.ts --verbose
git add apps/web/src/features/onboarding/api/__tests__/
git commit -m "test(onboarding): add API tests"
```

---

## Task 6: Settings — useSettings hook tests

**Files:**
- Create: `apps/web/src/features/settings/hooks/__tests__/useSettings.test.ts`

**Step 1: Write hook tests**

Test loadProfile, saveName, saveSettings, handleAvatarUpload, handleAvatarDelete — including error paths and toast calls.

```typescript
import { renderHook, act, waitFor } from '@testing-library/react'
import toast from 'react-hot-toast'
import { useSettings } from '../useSettings'
import * as settingsApi from '../../api/settings'

jest.mock('../../api/settings')
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }),
}))

const mockGetProfile = settingsApi.getProfile as jest.MockedFunction<typeof settingsApi.getProfile>
const mockUpdateProfile = settingsApi.updateProfile as jest.MockedFunction<typeof settingsApi.updateProfile>
const mockUpdateSettings = settingsApi.updateSettings as jest.MockedFunction<typeof settingsApi.updateSettings>
const mockUploadAvatar = settingsApi.uploadAvatar as jest.MockedFunction<typeof settingsApi.uploadAvatar>
const mockDeleteAvatar = settingsApi.deleteAvatar as jest.MockedFunction<typeof settingsApi.deleteAvatar>

const mockProfile = {
  id: 1,
  email: 'test@test.com',
  name: 'Test User',
  role: 'client',
  avatar_url: 'https://example.com/avatar.jpg',
  onboarding_completed: true,
  settings: { language: 'ru', units: 'metric', timezone: 'Europe/Moscow' },
}

describe('useSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetProfile.mockResolvedValue(mockProfile as any)
  })

  it('loads profile on mount', async () => {
    const { result } = renderHook(() => useSettings())
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(result.current.profile).toEqual(mockProfile)
    })
  })

  it('shows toast on profile load error', async () => {
    mockGetProfile.mockRejectedValueOnce(new Error('fail'))
    const { result } = renderHook(() => useSettings())
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
      expect(toast.error).toHaveBeenCalled()
    })
  })

  it('saveName calls updateProfile and reloads', async () => {
    mockUpdateProfile.mockResolvedValue(undefined as any)
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.saveName('New Name')
    })
    expect(mockUpdateProfile).toHaveBeenCalledWith({ name: 'New Name' })
  })

  it('saveSettings calls updateSettings', async () => {
    mockUpdateSettings.mockResolvedValue(undefined as any)
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.saveSettings({ language: 'en' })
    })
    expect(mockUpdateSettings).toHaveBeenCalledWith({ language: 'en' })
  })

  it('handleAvatarUpload uploads and updates state', async () => {
    mockUploadAvatar.mockResolvedValue('https://example.com/new.jpg')
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' })
    await act(async () => {
      await result.current.handleAvatarUpload(file)
    })
    expect(mockUploadAvatar).toHaveBeenCalledWith(file)
    expect(result.current.profile?.avatar_url).toBe('https://example.com/new.jpg')
  })

  it('handleAvatarDelete removes avatar', async () => {
    mockDeleteAvatar.mockResolvedValue(undefined as any)
    const { result } = renderHook(() => useSettings())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.handleAvatarDelete()
    })
    expect(mockDeleteAvatar).toHaveBeenCalled()
    expect(result.current.profile?.avatar_url).toBe('')
  })
})
```

**Step 2: Run and commit**

```bash
cd apps/web && npx jest src/features/settings/hooks/__tests__/useSettings.test.ts --verbose
git add apps/web/src/features/settings/hooks/__tests__/
git commit -m "test(settings): add useSettings hook tests"
```

---

## Task 7: Settings — API tests

**Files:**
- Create: `apps/web/src/features/settings/api/__tests__/settings.test.ts`

**Step 1: Write API tests**

Test getProfile, updateProfile, updateSettings, uploadAvatar, deleteAvatar.

```typescript
import { getProfile, updateProfile, updateSettings, uploadAvatar, deleteAvatar } from '../settings'
import { apiClient } from '@/shared/utils/api-client'

jest.mock('@/shared/utils/api-client', () => ({
  apiClient: {
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}))

const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>
const mockPut = apiClient.put as jest.MockedFunction<typeof apiClient.put>

describe('settings API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.setItem('auth_token', 'test-token')
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('getProfile calls correct endpoint', async () => {
    const mockProfile = { id: 1, name: 'Test' }
    mockGet.mockResolvedValue(mockProfile as any)
    const result = await getProfile()
    expect(mockGet).toHaveBeenCalledWith('/backend-api/v1/users/profile')
    expect(result).toEqual(mockProfile)
  })

  it('updateProfile calls PUT with name', async () => {
    mockPut.mockResolvedValue(undefined as any)
    await updateProfile({ name: 'New Name' })
    expect(mockPut).toHaveBeenCalledWith('/backend-api/v1/users/profile', { name: 'New Name' })
  })

  it('updateSettings calls PUT with partial settings', async () => {
    mockPut.mockResolvedValue(undefined as any)
    await updateSettings({ language: 'en', units: 'imperial' })
    expect(mockPut).toHaveBeenCalledWith('/backend-api/v1/users/settings', { language: 'en', units: 'imperial' })
  })

  it('uploadAvatar sends FormData with file', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ avatar_url: 'https://example.com/avatar.jpg' }),
    })
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' })
    const result = await uploadAvatar(file)
    expect(global.fetch).toHaveBeenCalled()
    expect(result).toBe('https://example.com/avatar.jpg')
  })

  it('deleteAvatar calls DELETE endpoint', async () => {
    const mockDelete = apiClient.delete as jest.MockedFunction<any>
    mockDelete.mockResolvedValue(undefined)
    await deleteAvatar()
    expect(mockDelete).toHaveBeenCalledWith('/backend-api/v1/users/avatar')
  })
})
```

**Step 2: Run and commit**

```bash
cd apps/web && npx jest src/features/settings/api/__tests__/settings.test.ts --verbose
git add apps/web/src/features/settings/api/__tests__/
git commit -m "test(settings): add API layer tests"
```

---

## Task 8: Settings — component tests (SettingsLocality, SettingsBody, SettingsSocial, SettingsNotifications, SettingsAppleHealth)

**Files:**
- Create: `apps/web/src/features/settings/components/__tests__/SettingsLocality.test.tsx`
- Create: `apps/web/src/features/settings/components/__tests__/SettingsBody.test.tsx`
- Create: `apps/web/src/features/settings/components/__tests__/SettingsSocial.test.tsx`
- Create: `apps/web/src/features/settings/components/__tests__/SettingsNotifications.test.tsx`
- Create: `apps/web/src/features/settings/components/__tests__/SettingsAppleHealth.test.tsx`

**Step 1: Write SettingsLocality tests**

Test name editing, height input validation, avatar upload/delete, language/unit/timezone selectors.

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsLocality } from '../SettingsLocality'

jest.mock('@/shared/components/settings', () => ({
  PhotoUploader: () => <div data-testid="photo-uploader">Photo</div>,
  LanguageSelector: ({ value, onChange }: any) => <select data-testid="lang" value={value} onChange={e => onChange(e.target.value)}><option value="ru">RU</option><option value="en">EN</option></select>,
  UnitSelector: ({ value }: any) => <div data-testid="units">{value}</div>,
  TimezoneSelector: ({ value }: any) => <div data-testid="tz">{value}</div>,
}))

const mockProfile = {
  id: 1, email: 'test@test.com', name: 'Test', role: 'client',
  avatar_url: '', onboarding_completed: true,
  settings: { language: 'ru', units: 'metric', timezone: 'Europe/Moscow', height: 175 },
}

const defaultProps = {
  profile: mockProfile as any,
  isLoading: false,
  saveName: jest.fn().mockResolvedValue(undefined),
  saveSettings: jest.fn().mockResolvedValue(undefined),
  handleAvatarUpload: jest.fn().mockResolvedValue(undefined),
  handleAvatarDelete: jest.fn().mockResolvedValue(undefined),
  loadProfile: jest.fn(),
}

describe('SettingsLocality', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders all settings sections', () => {
    render(<SettingsLocality {...defaultProps} />)
    expect(screen.getByTestId('photo-uploader')).toBeInTheDocument()
    expect(screen.getByTestId('lang')).toBeInTheDocument()
    expect(screen.getByTestId('units')).toBeInTheDocument()
    expect(screen.getByTestId('tz')).toBeInTheDocument()
  })

  it('shows name input with current value', () => {
    render(<SettingsLocality {...defaultProps} />)
    const input = screen.getByDisplayValue('Test')
    expect(input).toBeInTheDocument()
  })

  it('shows save button when name is changed', async () => {
    const user = userEvent.setup()
    render(<SettingsLocality {...defaultProps} />)
    const input = screen.getByDisplayValue('Test')
    await user.clear(input)
    await user.type(input, 'New Name')
    expect(screen.getByText(/сохранить/i)).toBeInTheDocument()
  })
})
```

**Step 2: Write remaining settings component tests**

Each test file follows the same pattern — mock dependencies, render with props, test rendering and interactions. Keep tests focused on behavior, not implementation details.

For SettingsBody: test form fields (birth date, sex radio, height, weight, activity level select, fitness goal radio), validation (height 50-300, weight 20-500), save call with payload.

For SettingsSocial: test telegram/instagram inputs, save button.

For SettingsNotifications: test global mute toggle, category toggles, disabled state when muted.

For SettingsAppleHealth: test toggle renders and calls saveSettings.

**Step 3: Run and commit**

```bash
cd apps/web && npx jest src/features/settings/components/__tests__/ --verbose
git add apps/web/src/features/settings/components/__tests__/
git commit -m "test(settings): add component tests for all settings views"
```

---

## Task 9: Chat — store tests

**Files:**
- Create: `apps/web/src/features/chat/store/__tests__/chatStore.test.ts`

**Step 1: Write store tests**

```typescript
import { renderHook, act } from '@testing-library/react'
import { useChatStore } from '../chatStore'

describe('useChatStore', () => {
  beforeEach(() => {
    act(() => {
      useChatStore.setState({ conversations: [], unreadTotal: 0 })
    })
  })

  it('setConversations replaces all conversations', () => {
    const { result } = renderHook(() => useChatStore())
    const convs = [{ id: '1', client_id: 1, curator_id: 2, client_name: 'A', curator_name: 'B', unread_count: 0, updated_at: '2024-01-01' }]
    act(() => { result.current.setConversations(convs as any) })
    expect(result.current.conversations).toEqual(convs)
  })

  it('incrementUnread adds 1 to unreadTotal', () => {
    const { result } = renderHook(() => useChatStore())
    act(() => { result.current.incrementUnread() })
    expect(result.current.unreadTotal).toBe(1)
    act(() => { result.current.incrementUnread() })
    expect(result.current.unreadTotal).toBe(2)
  })

  it('resetUnread sets unreadTotal to 0', () => {
    const { result } = renderHook(() => useChatStore())
    act(() => { result.current.incrementUnread() })
    act(() => { result.current.incrementUnread() })
    act(() => { result.current.resetUnread() })
    expect(result.current.unreadTotal).toBe(0)
  })

  it('setUnreadTotal sets exact value', () => {
    const { result } = renderHook(() => useChatStore())
    act(() => { result.current.setUnreadTotal(42) })
    expect(result.current.unreadTotal).toBe(42)
  })
})
```

**Step 2: Run and commit**

```bash
cd apps/web && npx jest src/features/chat/store/__tests__/chatStore.test.ts --verbose
git add apps/web/src/features/chat/store/__tests__/
git commit -m "test(chat): add store unit tests"
```

---

## Task 10: Chat — API tests

**Files:**
- Create: `apps/web/src/features/chat/api/__tests__/chatApi.test.ts`

**Step 1: Write API tests**

Test all chatApi methods — getConversations, getMessages (with cursor/limit), sendMessage, markAsRead, getUnreadCount, createFoodEntry, uploadFile.

```typescript
import { chatApi } from '../chatApi' // or however it's exported
import { apiClient } from '@/shared/utils/api-client'

jest.mock('@/shared/utils/api-client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}))

const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>
const mockPost = apiClient.post as jest.MockedFunction<typeof apiClient.post>

describe('chatApi', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.setItem('auth_token', 'test-token')
  })

  afterEach(() => localStorage.clear())

  it('getConversations fetches from correct endpoint', async () => {
    mockGet.mockResolvedValue([])
    await chatApi.getConversations()
    expect(mockGet).toHaveBeenCalledWith('/backend-api/v1/chat/conversations')
  })

  it('getMessages passes cursor and limit as query params', async () => {
    mockGet.mockResolvedValue([])
    await chatApi.getMessages('conv-1', 'cursor-123', 25)
    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining('cursor=cursor-123')
    )
    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining('limit=25')
    )
  })

  it('getMessages without cursor omits cursor param', async () => {
    mockGet.mockResolvedValue([])
    await chatApi.getMessages('conv-1')
    const url = mockGet.mock.calls[0][0]
    expect(url).not.toContain('cursor')
  })

  it('sendMessage posts to conversation endpoint', async () => {
    mockPost.mockResolvedValue({ id: 'msg-1' })
    await chatApi.sendMessage('conv-1', { type: 'text', content: 'Hello' })
    expect(mockPost).toHaveBeenCalledWith(
      '/backend-api/v1/chat/conversations/conv-1/messages',
      { type: 'text', content: 'Hello' }
    )
  })

  it('markAsRead posts to read endpoint', async () => {
    mockPost.mockResolvedValue(undefined)
    await chatApi.markAsRead('conv-1')
    expect(mockPost).toHaveBeenCalledWith(
      '/backend-api/v1/chat/conversations/conv-1/read',
      {}
    )
  })

  it('getUnreadCount returns count', async () => {
    mockGet.mockResolvedValue({ count: 5 })
    const result = await chatApi.getUnreadCount()
    expect(result).toEqual({ count: 5 })
  })

  it('createFoodEntry posts nutrition data', async () => {
    mockPost.mockResolvedValue({ id: 'entry-1' })
    const data = { food_name: 'Chicken', meal_type: 'lunch', weight: 200, calories: 300, protein: 30, fat: 10, carbs: 0 }
    await chatApi.createFoodEntry('conv-1', 'msg-1', data)
    expect(mockPost).toHaveBeenCalledWith(
      expect.stringContaining('conv-1'),
      expect.objectContaining(data)
    )
  })
})
```

**Step 2: Run and commit**

```bash
cd apps/web && npx jest src/features/chat/api/__tests__/chatApi.test.ts --verbose
git add apps/web/src/features/chat/api/__tests__/
git commit -m "test(chat): add API layer tests"
```

---

## Task 11: Chat — hooks tests (useChat, useUnreadCount, useWebSocket)

**Files:**
- Create: `apps/web/src/features/chat/hooks/__tests__/useChat.test.ts`
- Create: `apps/web/src/features/chat/hooks/__tests__/useUnreadCount.test.ts`
- Create: `apps/web/src/features/chat/hooks/__tests__/useWebSocket.test.ts`

**Step 1: Write useUnreadCount tests**

```typescript
import { renderHook, waitFor } from '@testing-library/react'
import { useUnreadCount } from '../useUnreadCount'
import { chatApi } from '../../api/chatApi'
import { useChatStore } from '../../store/chatStore'

jest.mock('../../api/chatApi')
jest.mock('../useWebSocket', () => ({
  useWebSocket: () => ({ lastEvent: null, sendEvent: jest.fn(), isConnected: false }),
}))

const mockGetUnreadCount = chatApi.getUnreadCount as jest.MockedFunction<typeof chatApi.getUnreadCount>

describe('useUnreadCount', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useChatStore.setState({ unreadTotal: 0 })
  })

  it('fetches initial unread count on mount', async () => {
    mockGetUnreadCount.mockResolvedValue({ count: 3 } as any)
    renderHook(() => useUnreadCount())
    await waitFor(() => {
      expect(mockGetUnreadCount).toHaveBeenCalled()
      expect(useChatStore.getState().unreadTotal).toBe(3)
    })
  })

  it('handles fetch error gracefully', async () => {
    mockGetUnreadCount.mockRejectedValue(new Error('fail'))
    renderHook(() => useUnreadCount())
    await waitFor(() => {
      expect(useChatStore.getState().unreadTotal).toBe(0)
    })
  })
})
```

**Step 2: Write useWebSocket tests**

Test standalone mode (outside provider) with mock WebSocket.

```typescript
// Mock global WebSocket
const mockWsSend = jest.fn()
const mockWsClose = jest.fn()
let mockWsInstance: any

class MockWebSocket {
  onopen: any
  onmessage: any
  onclose: any
  onerror: any
  readyState = 1
  send = mockWsSend
  close = mockWsClose
  constructor(public url: string) {
    mockWsInstance = this
    setTimeout(() => this.onopen?.(), 0)
  }
}

Object.defineProperty(global, 'WebSocket', { value: MockWebSocket, writable: true })
```

**Step 3: Write useChat tests**

Test message loading, sendMessage, loadMore pagination, WebSocket event handling.

**Step 4: Run all hook tests and commit**

```bash
cd apps/web && npx jest src/features/chat/hooks/__tests__/ --verbose
git add apps/web/src/features/chat/hooks/__tests__/
git commit -m "test(chat): add hook tests (useChat, useUnreadCount, useWebSocket)"
```

---

## Task 12: Chat — component tests

**Files:**
- Create: `apps/web/src/features/chat/components/__tests__/ConversationList.test.tsx`
- Create: `apps/web/src/features/chat/components/__tests__/MessageBubble.test.tsx`
- Create: `apps/web/src/features/chat/components/__tests__/ChatInput.test.tsx`
- Create: `apps/web/src/features/chat/components/__tests__/FoodEntryCard.test.tsx`
- Create: `apps/web/src/features/chat/components/__tests__/FileAttachment.test.tsx`
- Create: `apps/web/src/features/chat/components/__tests__/DateSeparator.test.tsx`

**Step 1: Write component tests**

Key tests per component:

**ConversationList:** fetch conversations, sort by unread then updated_at, display name/preview/time, click navigates.

**MessageBubble:** own vs other styling, text/image/file/food_entry rendering, time display.

**ChatInput:** type message, send button, file attachment, enter-to-send.

**FoodEntryCard:** renders nutrition data, meal type labels.

**FileAttachment:** image preview, non-image download link, file size formatting.

**DateSeparator:** renders date string.

**Step 2: Run and commit**

```bash
cd apps/web && npx jest src/features/chat/components/__tests__/ --verbose
git add apps/web/src/features/chat/components/__tests__/
git commit -m "test(chat): add component tests for all chat UI"
```

---

## Task 13: Nutrition-calc — API and component tests

**Files:**
- Create: `apps/web/src/features/nutrition-calc/api/__tests__/nutritionCalc.test.ts`
- Create: `apps/web/src/features/nutrition-calc/components/__tests__/ProfileCompletionBanner.test.tsx`
- Create: `apps/web/src/features/nutrition-calc/components/__tests__/KBJUWeeklyChart.test.tsx`

**Step 1: Write API tests**

Test getTargets (with/without date, null response), getHistory, recalculate, getClientHistory.

```typescript
import { getTargets, getHistory, recalculate, getClientHistory } from '../nutritionCalc'
import { apiClient } from '@/shared/utils/api-client'

jest.mock('@/shared/utils/api-client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}))

const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>
const mockPost = apiClient.post as jest.MockedFunction<typeof apiClient.post>

describe('nutrition-calc API', () => {
  beforeEach(() => jest.clearAllMocks())

  describe('getTargets', () => {
    it('returns targets when available', async () => {
      const targets = { calories: 2000, protein: 150, fat: 70, carbs: 200, bmr: 1800, tdee: 2200, workout_bonus: 0, weight_used: 75, source: 'calculated' }
      mockGet.mockResolvedValue(targets as any)
      const result = await getTargets()
      expect(result).toEqual(targets)
    })

    it('returns null when targets is null (incomplete profile)', async () => {
      mockGet.mockResolvedValue({ targets: null } as any)
      const result = await getTargets()
      expect(result).toBeNull()
    })

    it('passes date param when provided', async () => {
      mockGet.mockResolvedValue({ targets: null } as any)
      await getTargets('2024-01-15')
      expect(mockGet).toHaveBeenCalledWith('/backend-api/v1/nutrition-calc/targets?date=2024-01-15')
    })
  })

  describe('recalculate', () => {
    it('posts to recalculate endpoint', async () => {
      const targets = { calories: 2000, protein: 150, fat: 70, carbs: 200 }
      mockPost.mockResolvedValue(targets as any)
      const result = await recalculate()
      expect(mockPost).toHaveBeenCalledWith('/backend-api/v1/nutrition-calc/recalculate', {})
      expect(result).toEqual(targets)
    })
  })

  describe('getHistory', () => {
    it('fetches history with default 7 days', async () => {
      mockGet.mockResolvedValue({ days: [] })
      await getHistory()
      expect(mockGet).toHaveBeenCalledWith('/backend-api/v1/nutrition-calc/history?days=7')
    })
  })

  describe('getClientHistory', () => {
    it('fetches client history via curator endpoint', async () => {
      mockGet.mockResolvedValue({ days: [] })
      await getClientHistory(42, 14)
      expect(mockGet).toHaveBeenCalledWith('/backend-api/v1/curator/clients/42/targets/history?days=14')
    })
  })
})
```

**Step 2: Write ProfileCompletionBanner tests**

Test banner visibility based on profile completeness, 3-day dismiss logic, localStorage interaction.

**Step 3: Write KBJUWeeklyChart tests**

Mock recharts. Test data transformation (date formatting, status colors green/yellow/red based on deviation), empty data returns null, tooltip rendering.

**Step 4: Run and commit**

```bash
cd apps/web && npx jest src/features/nutrition-calc/ --verbose
git add apps/web/src/features/nutrition-calc/
git commit -m "test(nutrition-calc): add API and component tests"
```

---

## Task 14: Admin — API and component tests

**Files:**
- Create: `apps/web/src/features/admin/api/__tests__/adminApi.test.ts`
- Create: `apps/web/src/features/admin/components/__tests__/AdminFooterNavigation.test.tsx`
- Create: `apps/web/src/features/admin/components/__tests__/CuratorLoadCard.test.tsx`
- Create: `apps/web/src/features/admin/components/__tests__/UserList.test.tsx`
- Create: `apps/web/src/features/admin/components/__tests__/UserDetail.test.tsx`
- Create: `apps/web/src/features/admin/components/__tests__/AdminConversationList.test.tsx`
- Create: `apps/web/src/features/admin/components/__tests__/ReadOnlyMessageList.test.tsx`

**Step 1: Write adminApi tests**

Test all 6 API methods — getUsers, getCurators, changeRole, assignCurator, getConversations, getConversationMessages (with cursor/limit params).

**Step 2: Write component tests**

Key tests per component:

**AdminFooterNavigation:** renders 4 nav items, active state, click handler + router.push.

**CuratorLoadCard:** avatar/initials fallback, client count display.

**UserList:** loading/error/empty states, search filtering, role filtering, user count text, click navigates to detail.

**UserDetail:** loading/error states, user info display, role change with confirmation, curator assignment, toast notifications.

**AdminConversationList:** loading/error/empty states, conversation list rendering, navigation.

**ReadOnlyMessageList:** loading/error/empty states, message rendering, load more pagination.

**Step 3: Run and commit**

```bash
cd apps/web && npx jest src/features/admin/ --verbose
git add apps/web/src/features/admin/
git commit -m "test(admin): add API and component tests"
```

---

## Task 15: Curator — API and component tests

**Files:**
- Create: `apps/web/src/features/curator/api/__tests__/curatorApi.test.ts`
- Create: `apps/web/src/features/curator/components/__tests__/ClientCard.test.tsx`
- Create: `apps/web/src/features/curator/components/__tests__/ClientList.test.tsx`
- Create: `apps/web/src/features/curator/components/__tests__/AlertBadge.test.tsx`
- Create: `apps/web/src/features/curator/components/__tests__/KBZHUProgress.test.tsx`
- Create: `apps/web/src/features/curator/components/__tests__/CuratorFooterNavigation.test.tsx`
- Create: `apps/web/src/features/curator/components/__tests__/CuratorLayout.test.tsx`

**Step 1: Write curatorApi tests**

Test getClients, getClientDetail, setTargetWeight, setWaterGoal.

**Step 2: Write component tests**

**AlertBadge:** renders correct color per level (red/yellow/green), message text.

**ClientCard:** avatar/initials, KBZHU progress display, alerts, unread badge, weight trend.

**KBZHUProgress:** progress bar fill width, percentage calculation, color coding.

**ClientList:** fetch clients, loading/error/empty states, client card rendering.

**CuratorFooterNavigation:** renders nav items, active state, click navigation.

**CuratorLayout:** renders header + navigation + children.

**Step 3: Run and commit**

```bash
cd apps/web && npx jest src/features/curator/ --verbose
git add apps/web/src/features/curator/
git commit -m "test(curator): add API and component tests"
```

---

## Task 16: Backend — admin module tests

**Files:**
- Create: `apps/api/internal/modules/admin/handler_test.go`
- Create: `apps/api/internal/modules/admin/service_test.go`

**Step 1: Write service tests**

Test GetUsers (JOIN query), GetCurators, ChangeRole (transaction, curator demotion), AssignCurator, GetConversations, GetConversationMessages. Use sqlmock pattern from existing tests.

```go
package admin

import (
    "context"
    "testing"

    "github.com/DATA-DOG/go-sqlmock"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"

    "my-fitness-app/internal/shared/config"
    "my-fitness-app/internal/shared/logger"
)

func setupTestService(t *testing.T) (*Service, sqlmock.Sqlmock, func()) {
    db, mock, err := sqlmock.New()
    require.NoError(t, err)
    cfg := &config.Config{}
    log := logger.New()
    service := NewService(db, cfg, log)
    return service, mock, func() { db.Close() }
}

func TestGetUsers(t *testing.T) {
    service, mock, cleanup := setupTestService(t)
    defer cleanup()

    rows := sqlmock.NewRows([]string{"id", "email", "name", "role", "avatar_url", "curator_name", "curator_id", "client_count", "created_at", "last_login_at"}).
        AddRow(1, "user@test.com", "Test User", "client", nil, nil, nil, 0, "2024-01-01T00:00:00Z", nil)

    mock.ExpectQuery("SELECT").WillReturnRows(rows)

    users, err := service.GetUsers(context.Background())
    require.NoError(t, err)
    assert.Len(t, users, 1)
    assert.Equal(t, "Test User", users[0].Name)
}
```

**Step 2: Write handler tests**

Test HTTP endpoints: GET /admin/users, POST /admin/users/:id/role, POST /admin/assignments, etc.

**Step 3: Run and commit**

```bash
cd apps/api && go test ./internal/modules/admin/ -v
git add apps/api/internal/modules/admin/*_test.go
git commit -m "test(api/admin): add handler and service tests"
```

---

## Task 17: Backend — fill gaps in chat, content, curator, nutrition-calc

**Files:**
- Create: `apps/api/internal/modules/chat/handler_test.go`
- Create: `apps/api/internal/modules/content/handler_test.go`
- Create: `apps/api/internal/modules/curator/handler_test.go`
- Create: `apps/api/internal/modules/nutrition-calc/handler_test.go`
- Create: `apps/api/internal/modules/nutrition-calc/service_test.go`

**Step 1: Write chat handler tests**

Test GetConversations, GetMessages, SendMessage, MarkAsRead, GetUnreadCount, UploadAttachment HTTP handlers.

**Step 2: Write content handler tests**

Test CRUD endpoints: CreateArticle, GetArticle, ListArticles, UpdateArticle, DeleteArticle, PublishArticle.

**Step 3: Write curator handler tests**

Test GetClients, GetClientDetail, SetTargetWeight, SetWaterGoal handlers.

**Step 4: Write nutrition-calc handler + service tests**

Handler: GetTargets, GetHistory, Recalculate.
Service: RecalculateForDate (Mifflin-St Jeor formula), GetTargetsForDate, GetHistory.

**Step 5: Run and commit**

```bash
cd apps/api && go test ./internal/modules/chat/ ./internal/modules/content/ ./internal/modules/curator/ ./internal/modules/nutrition-calc/ -v
git add apps/api/internal/modules/chat/handler_test.go
git add apps/api/internal/modules/content/handler_test.go
git add apps/api/internal/modules/curator/handler_test.go
git add apps/api/internal/modules/nutrition-calc/handler_test.go
git add apps/api/internal/modules/nutrition-calc/service_test.go
git commit -m "test(api): add handler tests for chat, content, curator, nutrition-calc"
```

---

## Task 18: Strengthen existing feature tests

**Files:**
- Create: `apps/web/src/features/content/components/__tests__/` (additional tests)
- Modify: existing test files for auth, dashboard, food-tracker, notifications — add edge cases

**Step 1: Review coverage gaps in existing features**

```bash
cd apps/web && npx jest --coverage --collectCoverageFrom='src/features/**/*.{ts,tsx}' --silent 2>&1 | head -60
```

Identify files with <80% coverage in already-tested features.

**Step 2: Write targeted tests for uncovered branches**

Focus on:
- Error handling paths (API failures, network errors)
- Edge cases (empty arrays, null values, boundary values)
- Untested component states (loading, error, empty)

**Step 3: Run and commit**

```bash
cd apps/web && npx jest --coverage --silent 2>&1 | tail -20
git add -A
git commit -m "test: strengthen existing feature test coverage"
```

---

## Task 19: Raise coverage thresholds

**Files:**
- Modify: `apps/web/jest.config.js`

**Step 1: Update thresholds**

Change coverage thresholds in jest.config.js:

```javascript
coverageThreshold: {
  global: {
    branches: 80,
    functions: 85,
    lines: 85,
    statements: 85,
  },
},
```

**Step 2: Verify all tests pass with new thresholds**

```bash
cd apps/web && npx jest --coverage
```

**Step 3: Commit**

```bash
git add apps/web/jest.config.js
git commit -m "chore: raise coverage thresholds to 80-85%"
```

---

## Task 20: Final verification and cleanup

**Step 1: Run full test suite**

```bash
cd /Users/thatguy/src/my-fitness-app
cd apps/web && npx jest --coverage --silent
cd ../api && go test ./... -v -count=1
```

**Step 2: Verify CI compatibility**

```bash
cd apps/web && npm run lint && npm run type-check
cd ../api && go fmt ./... && go vet ./...
```

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "test: final cleanup and CI verification"
```
