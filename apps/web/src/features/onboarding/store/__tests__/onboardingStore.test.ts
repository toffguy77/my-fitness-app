import { renderHook, act } from '@testing-library/react'
import { useOnboardingStore } from '../onboardingStore'

describe('useOnboardingStore', () => {
    beforeEach(() => {
        act(() => {
            useOnboardingStore.getState().reset()
        })
    })

    describe('initial state', () => {
        it('has correct default values', () => {
            const { result } = renderHook(() => useOnboardingStore())

            expect(result.current.currentStep).toBe(0)
            expect(result.current.totalSteps).toBe(5)
            expect(result.current.avatarUrl).toBe('')
            expect(result.current.language).toBe('ru')
            expect(result.current.units).toBe('metric')
            expect(result.current.timezone).toBe(
                Intl.DateTimeFormat().resolvedOptions().timeZone,
            )
            expect(result.current.birthDate).toBe('')
            expect(result.current.biologicalSex).toBe('')
            expect(result.current.currentWeight).toBe('')
            expect(result.current.height).toBe('')
            expect(result.current.activityLevel).toBe('moderate')
            expect(result.current.fitnessGoal).toBe('maintain')
            expect(result.current.telegram).toBe('')
            expect(result.current.instagram).toBe('')
            expect(result.current.appleHealthEnabled).toBe(false)
        })
    })

    describe('step navigation', () => {
        it('nextStep increments currentStep by 1', () => {
            const { result } = renderHook(() => useOnboardingStore())

            act(() => {
                result.current.nextStep()
            })
            expect(result.current.currentStep).toBe(1)

            act(() => {
                result.current.nextStep()
            })
            expect(result.current.currentStep).toBe(2)
        })

        it('nextStep does not exceed totalSteps - 1', () => {
            const { result } = renderHook(() => useOnboardingStore())

            // Go to the last step
            for (let i = 0; i < 10; i++) {
                act(() => {
                    result.current.nextStep()
                })
            }
            expect(result.current.currentStep).toBe(4)
        })

        it('prevStep decrements currentStep by 1', () => {
            const { result } = renderHook(() => useOnboardingStore())

            act(() => {
                result.current.setStep(3)
            })

            act(() => {
                result.current.prevStep()
            })
            expect(result.current.currentStep).toBe(2)

            act(() => {
                result.current.prevStep()
            })
            expect(result.current.currentStep).toBe(1)
        })

        it('prevStep does not go below 0', () => {
            const { result } = renderHook(() => useOnboardingStore())

            act(() => {
                result.current.prevStep()
            })
            expect(result.current.currentStep).toBe(0)

            // Try multiple times
            for (let i = 0; i < 5; i++) {
                act(() => {
                    result.current.prevStep()
                })
            }
            expect(result.current.currentStep).toBe(0)
        })

        it('setStep sets an arbitrary step', () => {
            const { result } = renderHook(() => useOnboardingStore())

            act(() => {
                result.current.setStep(3)
            })
            expect(result.current.currentStep).toBe(3)

            act(() => {
                result.current.setStep(0)
            })
            expect(result.current.currentStep).toBe(0)
        })
    })

    describe('setters', () => {
        it('setLanguage updates language', () => {
            const { result } = renderHook(() => useOnboardingStore())

            act(() => {
                result.current.setLanguage('en')
            })
            expect(result.current.language).toBe('en')

            act(() => {
                result.current.setLanguage('ru')
            })
            expect(result.current.language).toBe('ru')
        })

        it('setUnits updates units', () => {
            const { result } = renderHook(() => useOnboardingStore())

            act(() => {
                result.current.setUnits('imperial')
            })
            expect(result.current.units).toBe('imperial')

            act(() => {
                result.current.setUnits('metric')
            })
            expect(result.current.units).toBe('metric')
        })

        it('setBiologicalSex updates biologicalSex', () => {
            const { result } = renderHook(() => useOnboardingStore())

            act(() => {
                result.current.setBiologicalSex('male')
            })
            expect(result.current.biologicalSex).toBe('male')

            act(() => {
                result.current.setBiologicalSex('female')
            })
            expect(result.current.biologicalSex).toBe('female')

            act(() => {
                result.current.setBiologicalSex('')
            })
            expect(result.current.biologicalSex).toBe('')
        })

        it('setFitnessGoal updates fitnessGoal', () => {
            const { result } = renderHook(() => useOnboardingStore())

            act(() => {
                result.current.setFitnessGoal('loss')
            })
            expect(result.current.fitnessGoal).toBe('loss')

            act(() => {
                result.current.setFitnessGoal('gain')
            })
            expect(result.current.fitnessGoal).toBe('gain')

            act(() => {
                result.current.setFitnessGoal('maintain')
            })
            expect(result.current.fitnessGoal).toBe('maintain')
        })

        it('setAppleHealth updates appleHealthEnabled', () => {
            const { result } = renderHook(() => useOnboardingStore())

            act(() => {
                result.current.setAppleHealth(true)
            })
            expect(result.current.appleHealthEnabled).toBe(true)

            act(() => {
                result.current.setAppleHealth(false)
            })
            expect(result.current.appleHealthEnabled).toBe(false)
        })

        it('setAvatarUrl updates avatarUrl', () => {
            const { result } = renderHook(() => useOnboardingStore())

            act(() => {
                result.current.setAvatarUrl('https://example.com/avatar.png')
            })
            expect(result.current.avatarUrl).toBe('https://example.com/avatar.png')
        })

        it('setTimezone updates timezone', () => {
            const { result } = renderHook(() => useOnboardingStore())

            act(() => {
                result.current.setTimezone('America/New_York')
            })
            expect(result.current.timezone).toBe('America/New_York')
        })

        it('setBirthDate updates birthDate', () => {
            const { result } = renderHook(() => useOnboardingStore())

            act(() => {
                result.current.setBirthDate('1990-05-15')
            })
            expect(result.current.birthDate).toBe('1990-05-15')
        })

        it('setCurrentWeight updates currentWeight', () => {
            const { result } = renderHook(() => useOnboardingStore())

            act(() => {
                result.current.setCurrentWeight('75.5')
            })
            expect(result.current.currentWeight).toBe('75.5')
        })

        it('setHeight updates height', () => {
            const { result } = renderHook(() => useOnboardingStore())

            act(() => {
                result.current.setHeight('180')
            })
            expect(result.current.height).toBe('180')
        })

        it('setActivityLevel updates activityLevel', () => {
            const { result } = renderHook(() => useOnboardingStore())

            act(() => {
                result.current.setActivityLevel('sedentary')
            })
            expect(result.current.activityLevel).toBe('sedentary')

            act(() => {
                result.current.setActivityLevel('light')
            })
            expect(result.current.activityLevel).toBe('light')

            act(() => {
                result.current.setActivityLevel('active')
            })
            expect(result.current.activityLevel).toBe('active')
        })

        it('setTelegram updates telegram', () => {
            const { result } = renderHook(() => useOnboardingStore())

            act(() => {
                result.current.setTelegram('@myhandle')
            })
            expect(result.current.telegram).toBe('@myhandle')
        })

        it('setInstagram updates instagram', () => {
            const { result } = renderHook(() => useOnboardingStore())

            act(() => {
                result.current.setInstagram('@instauser')
            })
            expect(result.current.instagram).toBe('@instauser')
        })
    })

    describe('reset', () => {
        it('restores all values to initial state', () => {
            const { result } = renderHook(() => useOnboardingStore())

            // Modify everything
            act(() => {
                result.current.setStep(3)
                result.current.setLanguage('en')
                result.current.setUnits('imperial')
                result.current.setBiologicalSex('male')
                result.current.setFitnessGoal('loss')
                result.current.setAppleHealth(true)
                result.current.setAvatarUrl('https://example.com/pic.jpg')
                result.current.setTimezone('America/New_York')
                result.current.setBirthDate('1990-01-01')
                result.current.setCurrentWeight('80')
                result.current.setHeight('175')
                result.current.setActivityLevel('active')
                result.current.setTelegram('@tg')
                result.current.setInstagram('@ig')
            })

            // Verify modifications took effect
            expect(result.current.currentStep).toBe(3)
            expect(result.current.language).toBe('en')

            // Reset
            act(() => {
                result.current.reset()
            })

            // Verify all defaults restored
            expect(result.current.currentStep).toBe(0)
            expect(result.current.totalSteps).toBe(5)
            expect(result.current.avatarUrl).toBe('')
            expect(result.current.language).toBe('ru')
            expect(result.current.units).toBe('metric')
            expect(result.current.timezone).toBe(
                Intl.DateTimeFormat().resolvedOptions().timeZone,
            )
            expect(result.current.birthDate).toBe('')
            expect(result.current.biologicalSex).toBe('')
            expect(result.current.currentWeight).toBe('')
            expect(result.current.height).toBe('')
            expect(result.current.activityLevel).toBe('moderate')
            expect(result.current.fitnessGoal).toBe('maintain')
            expect(result.current.telegram).toBe('')
            expect(result.current.instagram).toBe('')
            expect(result.current.appleHealthEnabled).toBe(false)
        })
    })
})
