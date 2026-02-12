/**
 * Unit tests for useWaterTracker hook
 */

import { renderHook, act } from '@testing-library/react';
import { useWaterTracker } from '../useWaterTracker';
import { useFoodTrackerStore } from '../../store/foodTrackerStore';

// Mock the store
jest.mock('../../store/foodTrackerStore');

// Mock toast
jest.mock('react-hot-toast', () => ({
    success: jest.fn(),
    error: jest.fn(),
}));

describe('useWaterTracker', () => {
    const mockAddWater = jest.fn();
    const mockSetWaterGoal = jest.fn();
    const mockSetGlassSize = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();

        (useFoodTrackerStore as unknown as jest.Mock).mockImplementation((selector) => {
            const state = {
                waterIntake: 3,
                waterGoal: 8,
                glassSize: 250,
                addWater: mockAddWater,
                setWaterGoal: mockSetWaterGoal,
                setGlassSize: mockSetGlassSize,
            };
            return selector(state);
        });
    });

    describe('state', () => {
        it('returns water intake from store', () => {
            const { result } = renderHook(() => useWaterTracker());

            expect(result.current.waterIntake).toBe(3);
        });

        it('returns water goal from store', () => {
            const { result } = renderHook(() => useWaterTracker());

            expect(result.current.waterGoal).toBe(8);
        });

        it('returns glass size from store', () => {
            const { result } = renderHook(() => useWaterTracker());

            expect(result.current.glassSize).toBe(250);
        });
    });

    describe('calculated values', () => {
        it('calculates water intake in milliliters', () => {
            const { result } = renderHook(() => useWaterTracker());

            // 3 glasses * 250ml = 750ml
            expect(result.current.waterIntakeMl).toBe(750);
        });

        it('calculates water goal in milliliters', () => {
            const { result } = renderHook(() => useWaterTracker());

            // 8 glasses * 250ml = 2000ml
            expect(result.current.waterGoalMl).toBe(2000);
        });

        it('calculates progress percentage', () => {
            const { result } = renderHook(() => useWaterTracker());

            // 3/8 * 100 = 37.5, rounded to 38
            expect(result.current.progressPercentage).toBe(38);
        });

        it('returns isGoalReached as false when below goal', () => {
            const { result } = renderHook(() => useWaterTracker());

            expect(result.current.isGoalReached).toBe(false);
        });

        it('returns isGoalReached as true when at goal', () => {
            (useFoodTrackerStore as unknown as jest.Mock).mockImplementation((selector) => {
                const state = {
                    waterIntake: 8,
                    waterGoal: 8,
                    glassSize: 250,
                    addWater: mockAddWater,
                    setWaterGoal: mockSetWaterGoal,
                    setGlassSize: mockSetGlassSize,
                };
                return selector(state);
            });

            const { result } = renderHook(() => useWaterTracker());

            expect(result.current.isGoalReached).toBe(true);
        });

        it('returns isGoalReached as true when above goal', () => {
            (useFoodTrackerStore as unknown as jest.Mock).mockImplementation((selector) => {
                const state = {
                    waterIntake: 10,
                    waterGoal: 8,
                    glassSize: 250,
                    addWater: mockAddWater,
                    setWaterGoal: mockSetWaterGoal,
                    setGlassSize: mockSetGlassSize,
                };
                return selector(state);
            });

            const { result } = renderHook(() => useWaterTracker());

            expect(result.current.isGoalReached).toBe(true);
        });

        it('calculates remaining glasses', () => {
            const { result } = renderHook(() => useWaterTracker());

            // 8 - 3 = 5
            expect(result.current.remainingGlasses).toBe(5);
        });

        it('returns 0 remaining glasses when goal reached', () => {
            (useFoodTrackerStore as unknown as jest.Mock).mockImplementation((selector) => {
                const state = {
                    waterIntake: 10,
                    waterGoal: 8,
                    glassSize: 250,
                    addWater: mockAddWater,
                    setWaterGoal: mockSetWaterGoal,
                    setGlassSize: mockSetGlassSize,
                };
                return selector(state);
            });

            const { result } = renderHook(() => useWaterTracker());

            expect(result.current.remainingGlasses).toBe(0);
        });
    });

    describe('default values', () => {
        it('uses default water goal when store value is 0', () => {
            (useFoodTrackerStore as unknown as jest.Mock).mockImplementation((selector) => {
                const state = {
                    waterIntake: 3,
                    waterGoal: 0,
                    glassSize: 250,
                    addWater: mockAddWater,
                    setWaterGoal: mockSetWaterGoal,
                    setGlassSize: mockSetGlassSize,
                };
                return selector(state);
            });

            const { result } = renderHook(() => useWaterTracker());

            expect(result.current.waterGoal).toBe(8); // Default
        });

        it('uses default glass size when store value is 0', () => {
            (useFoodTrackerStore as unknown as jest.Mock).mockImplementation((selector) => {
                const state = {
                    waterIntake: 3,
                    waterGoal: 8,
                    glassSize: 0,
                    addWater: mockAddWater,
                    setWaterGoal: mockSetWaterGoal,
                    setGlassSize: mockSetGlassSize,
                };
                return selector(state);
            });

            const { result } = renderHook(() => useWaterTracker());

            expect(result.current.glassSize).toBe(250); // Default
        });
    });

    describe('addWater', () => {
        it('calls store addWater with default 1 glass', async () => {
            const { result } = renderHook(() => useWaterTracker());

            await act(async () => {
                await result.current.addWater();
            });

            expect(mockAddWater).toHaveBeenCalledWith(1);
        });

        it('calls store addWater with specified glasses', async () => {
            const { result } = renderHook(() => useWaterTracker());

            await act(async () => {
                await result.current.addWater(2);
            });

            expect(mockAddWater).toHaveBeenCalledWith(2);
        });
    });

    describe('setWaterGoal', () => {
        it('calls store setWaterGoal with valid goal', () => {
            const { result } = renderHook(() => useWaterTracker());

            act(() => {
                result.current.setWaterGoal(10);
            });

            expect(mockSetWaterGoal).toHaveBeenCalledWith(10);
        });

        it('does not call store setWaterGoal with zero', () => {
            const { result } = renderHook(() => useWaterTracker());

            act(() => {
                result.current.setWaterGoal(0);
            });

            expect(mockSetWaterGoal).not.toHaveBeenCalled();
        });

        it('does not call store setWaterGoal with negative value', () => {
            const { result } = renderHook(() => useWaterTracker());

            act(() => {
                result.current.setWaterGoal(-5);
            });

            expect(mockSetWaterGoal).not.toHaveBeenCalled();
        });
    });

    describe('setGlassSize', () => {
        it('calls store setGlassSize with valid size', () => {
            const { result } = renderHook(() => useWaterTracker());

            act(() => {
                result.current.setGlassSize(300);
            });

            expect(mockSetGlassSize).toHaveBeenCalledWith(300);
        });

        it('does not call store setGlassSize with zero', () => {
            const { result } = renderHook(() => useWaterTracker());

            act(() => {
                result.current.setGlassSize(0);
            });

            expect(mockSetGlassSize).not.toHaveBeenCalled();
        });

        it('does not call store setGlassSize with negative value', () => {
            const { result } = renderHook(() => useWaterTracker());

            act(() => {
                result.current.setGlassSize(-100);
            });

            expect(mockSetGlassSize).not.toHaveBeenCalled();
        });
    });

    describe('edge cases', () => {
        it('handles zero water intake', () => {
            (useFoodTrackerStore as unknown as jest.Mock).mockImplementation((selector) => {
                const state = {
                    waterIntake: 0,
                    waterGoal: 8,
                    glassSize: 250,
                    addWater: mockAddWater,
                    setWaterGoal: mockSetWaterGoal,
                    setGlassSize: mockSetGlassSize,
                };
                return selector(state);
            });

            const { result } = renderHook(() => useWaterTracker());

            expect(result.current.waterIntakeMl).toBe(0);
            expect(result.current.progressPercentage).toBe(0);
            expect(result.current.isGoalReached).toBe(false);
            expect(result.current.remainingGlasses).toBe(8);
        });

        it('handles 100% progress', () => {
            (useFoodTrackerStore as unknown as jest.Mock).mockImplementation((selector) => {
                const state = {
                    waterIntake: 8,
                    waterGoal: 8,
                    glassSize: 250,
                    addWater: mockAddWater,
                    setWaterGoal: mockSetWaterGoal,
                    setGlassSize: mockSetGlassSize,
                };
                return selector(state);
            });

            const { result } = renderHook(() => useWaterTracker());

            expect(result.current.progressPercentage).toBe(100);
        });

        it('handles over 100% progress', () => {
            (useFoodTrackerStore as unknown as jest.Mock).mockImplementation((selector) => {
                const state = {
                    waterIntake: 12,
                    waterGoal: 8,
                    glassSize: 250,
                    addWater: mockAddWater,
                    setWaterGoal: mockSetWaterGoal,
                    setGlassSize: mockSetGlassSize,
                };
                return selector(state);
            });

            const { result } = renderHook(() => useWaterTracker());

            expect(result.current.progressPercentage).toBe(150);
        });
    });
});
