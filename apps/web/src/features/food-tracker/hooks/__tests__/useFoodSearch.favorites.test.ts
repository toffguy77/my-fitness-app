/**
 * Избранное: добавление и снятие.
 *
 * До этой правки обе половины существовали и не встречались: `POST` и
 * `DELETE /api/v1/food-tracker/favorites/:foodId` зарегистрированы и написаны, а
 * кнопки в интерфейсе не было — раздел избранного показывался и всегда оставался
 * пустым. Нашла это обратная проверка маршрутов, заведённая изменением
 * `unreachable-routes`.
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { useFoodSearch } from '../useFoodSearch';
import { apiClient } from '@/shared/utils/api-client';
import type { FoodItem } from '../../types';

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        get: jest.fn(),
        post: jest.fn(),
        delete: jest.fn(),
    },
}));

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const del = apiClient.delete as jest.Mock;

function food(id: string, name: string): FoodItem {
    return {
        id,
        name,
        category: 'other',
        servingSize: 100,
        servingUnit: 'g',
        nutritionPer100: { calories: 100, protein: 5, fat: 2, carbs: 10 },
    } as FoodItem;
}

const BUCKWHEAT = food('1', 'Гречка');
const MILK = food('2', 'Молоко');

describe('Избранное', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        get.mockResolvedValue({ foods: [] });
        post.mockResolvedValue({});
        del.mockResolvedValue({});
    });

    it('добавляет продукт и показывает его в избранном', async () => {
        const { result } = renderHook(() => useFoodSearch({ autoLoadRecent: false }));

        get.mockResolvedValue({ foods: [BUCKWHEAT] });
        await act(async () => {
            await result.current.toggleFavorite('1');
        });

        expect(post).toHaveBeenCalledWith('/api/v1/food-tracker/favorites/1', {});
        await waitFor(() => expect(result.current.favoriteIds.has('1')).toBe(true));
        expect(result.current.favoriteFoods.map((f) => f.name)).toEqual(['Гречка']);
    });

    it('убирает продукт из избранного', async () => {
        get.mockResolvedValue({ foods: [BUCKWHEAT, MILK] });
        const { result } = renderHook(() => useFoodSearch({ autoLoadRecent: false }));

        await act(async () => {
            await result.current.loadFavoriteFoods();
        });
        expect(result.current.favoriteIds.has('1')).toBe(true);

        get.mockResolvedValue({ foods: [MILK] });
        await act(async () => {
            await result.current.toggleFavorite('1');
        });

        expect(del).toHaveBeenCalledWith('/api/v1/food-tracker/favorites/1');
        await waitFor(() => expect(result.current.favoriteIds.has('1')).toBe(false));
    });

    // Звёздочка, которая зажглась и погасла, не говорит человеку, сохранилось ли
    // что-нибудь. Поэтому отметка меняется после ответа сервера.
    it('оставляет прежнее состояние, когда добавить не удалось', async () => {
        post.mockRejectedValue(new Error('сеть'));
        const { result } = renderHook(() => useFoodSearch({ autoLoadRecent: false }));

        await act(async () => {
            await result.current.toggleFavorite('1');
        });

        expect(result.current.favoriteIds.has('1')).toBe(false);
        expect(result.current.favoriteError).toBeTruthy();
    });

    it('оставляет продукт в избранном, когда снять не удалось', async () => {
        get.mockResolvedValue({ foods: [BUCKWHEAT] });
        const { result } = renderHook(() => useFoodSearch({ autoLoadRecent: false }));
        await act(async () => {
            await result.current.loadFavoriteFoods();
        });

        del.mockRejectedValue(new Error('сеть'));
        await act(async () => {
            await result.current.toggleFavorite('1');
        });

        expect(result.current.favoriteIds.has('1')).toBe(true);
        expect(result.current.favoriteError).toBeTruthy();
    });

    it('перечитывает список у сервера, а не додумывает его сам', async () => {
        const { result } = renderHook(() => useFoodSearch({ autoLoadRecent: false }));

        get.mockClear();
        get.mockResolvedValue({ foods: [BUCKWHEAT] });
        await act(async () => {
            await result.current.toggleFavorite('1');
        });

        expect(get).toHaveBeenCalledWith('/api/v1/food-tracker/favorites');
    });
});
