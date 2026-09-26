/**
 * Тесты хука рекомендаций.
 *
 * Подменяется слой API, а не `fetch`: преобразование ответа сервера проверяется
 * отдельно, на настоящем ответе, в `api/__tests__/recommendationsApi.test.ts`.
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { useRecommendations } from '../useRecommendations';
import {
    fetchRecommendations,
    updateNutrientPreferences,
    createCustomRecommendation,
} from '../../api/recommendationsApi';
import type { RecommendationsData } from '../../api/recommendationsApi';

jest.mock('../../api/recommendationsApi', () => ({
    fetchRecommendations: jest.fn(),
    updateNutrientPreferences: jest.fn(),
    createCustomRecommendation: jest.fn(),
}));

const load = fetchRecommendations as jest.MockedFunction<typeof fetchRecommendations>;
const save = updateNutrientPreferences as jest.MockedFunction<typeof updateNutrientPreferences>;
const create = createCustomRecommendation as jest.MockedFunction<typeof createCustomRecommendation>;

const DATA: RecommendationsData = {
    nutrients: [
        {
            id: 'a',
            name: 'Витамин C',
            category: 'vitamins',
            dailyTarget: 90,
            unit: 'mg',
            isWeekly: false,
            isCustom: false,
        },
        {
            id: 'b',
            name: 'Витамин D',
            category: 'vitamins',
            dailyTarget: 15,
            unit: 'mcg',
            isWeekly: false,
            isCustom: false,
        },
    ],
    trackedIds: ['a'],
    customRecommendations: [{ id: 'c', name: 'Коллаген', dailyTarget: 5, unit: 'g' }],
    currentIntakes: { a: 45, b: 0 },
};

describe('useRecommendations', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        load.mockResolvedValue(DATA);
        save.mockResolvedValue(undefined);
    });

    it('показывает загрузку, пока ответа нет', () => {
        const { result } = renderHook(() => useRecommendations());

        expect(result.current.isLoading).toBe(true);
        expect(result.current.error).toBeNull();
    });

    it('не зовёт сервер, пока вкладка не открыта', () => {
        const { result } = renderHook(() => useRecommendations({ enabled: false }));

        expect(load).not.toHaveBeenCalled();
        expect(result.current.isLoading).toBe(false);
    });

    it('отдаёт данные и делит нутриенты на отслеживаемые и все', async () => {
        const { result } = renderHook(() => useRecommendations());

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.nutrients).toHaveLength(2);
        expect(result.current.trackedNutrients.map((n) => n.name)).toEqual(['Витамин C']);
        expect(result.current.trackedIds).toEqual(['a']);
        expect(result.current.currentIntakes).toEqual({ a: 45, b: 0 });
        expect(result.current.catalogueEmpty).toBe(false);
    });

    // Справочник пуст и на dev, и на проде: это состояние надо называть, а не
    // показывать пустым экраном.
    it('называет пустой справочник отдельным состоянием', async () => {
        load.mockResolvedValue({
            nutrients: [],
            trackedIds: [],
            customRecommendations: [],
            currentIntakes: {},
        });

        const { result } = renderHook(() => useRecommendations());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.catalogueEmpty).toBe(true);
    });

    // Пока ответа не было, «пусто» и «не спрашивали» неразличимы — и второе
    // объяснять человеку нечего.
    it('не называет справочник пустым до ответа сервера', () => {
        const { result } = renderHook(() => useRecommendations());

        expect(result.current.catalogueEmpty).toBe(false);
    });

    it('сообщает об ошибке запроса и не выдаёт нули за данные', async () => {
        load.mockRejectedValue(new Error('сеть'));

        const { result } = renderHook(() => useRecommendations());
        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.error).toBeTruthy();
        expect(result.current.nutrients).toEqual([]);
        expect(result.current.catalogueEmpty).toBe(false);
    });

    it('повторяет запрос по просьбе', async () => {
        load.mockRejectedValueOnce(new Error('сеть'));

        const { result } = renderHook(() => useRecommendations());
        await waitFor(() => expect(result.current.error).toBeTruthy());

        act(() => result.current.reload());
        // Ждём данные, а не обнуления ошибки: reload сбрасывает её сразу, ещё до
        // ответа сервера.
        await waitFor(() => expect(result.current.nutrients).toHaveLength(2));

        expect(load).toHaveBeenCalledTimes(2);
        expect(result.current.error).toBeNull();
    });

    describe('настройки отслеживания', () => {
        it('сохраняет полный набор и показывает новый выбор', async () => {
            const { result } = renderHook(() => useRecommendations());
            await waitFor(() => expect(result.current.isLoading).toBe(false));

            await act(async () => {
                await result.current.savePreferences(['a', 'b']);
            });

            expect(save).toHaveBeenCalledWith(['a', 'b']);
            expect(result.current.trackedIds).toEqual(['a', 'b']);
            expect(result.current.trackedNutrients).toHaveLength(2);
        });

        it('оставляет прежний выбор видимым, когда сохранить не удалось', async () => {
            save.mockRejectedValue(new Error('сеть'));

            const { result } = renderHook(() => useRecommendations());
            await waitFor(() => expect(result.current.isLoading).toBe(false));

            let saved = true;
            await act(async () => {
                saved = await result.current.savePreferences(['a', 'b']);
            });

            expect(saved).toBe(false);
            expect(result.current.actionError).toBeTruthy();
            expect(result.current.trackedIds).toEqual(['a']);
        });
    });

    describe('своя рекомендация', () => {
        it('добавляет и показывает её сразу', async () => {
            create.mockResolvedValue({ id: 'new', name: 'Магний', dailyTarget: 400, unit: 'mg' });

            const { result } = renderHook(() => useRecommendations());
            await waitFor(() => expect(result.current.isLoading).toBe(false));

            await act(async () => {
                await result.current.addCustomRecommendation({
                    name: 'Магний',
                    dailyTarget: 400,
                    unit: 'mg',
                });
            });

            expect(result.current.customRecommendations.map((r) => r.name)).toEqual([
                'Магний',
                'Коллаген',
            ]);
        });

        it('сообщает, когда добавить не удалось', async () => {
            create.mockRejectedValue(new Error('сеть'));

            const { result } = renderHook(() => useRecommendations());
            await waitFor(() => expect(result.current.isLoading).toBe(false));

            let added = true;
            await act(async () => {
                added = await result.current.addCustomRecommendation({
                    name: 'Магний',
                    dailyTarget: 400,
                    unit: 'mg',
                });
            });

            expect(added).toBe(false);
            expect(result.current.actionError).toBeTruthy();
            expect(result.current.customRecommendations).toHaveLength(1);
        });

        it('убирает сообщение об ошибке по просьбе', async () => {
            create.mockRejectedValue(new Error('сеть'));

            const { result } = renderHook(() => useRecommendations());
            await waitFor(() => expect(result.current.isLoading).toBe(false));

            await act(async () => {
                await result.current.addCustomRecommendation({
                    name: 'Магний',
                    dailyTarget: 400,
                    unit: 'mg',
                });
            });
            act(() => result.current.clearActionError());

            expect(result.current.actionError).toBeNull();
        });
    });
});
