'use client';

/**
 * useRecommendations Hook
 *
 * Загружает рекомендации по питанию и сохраняет настройки.
 *
 * До этого хука обе половины функции существовали и не встречались: четыре
 * обработчика на сервере, вкладка на 321 строку с тремя файлами тестов — и ни
 * одного вызова между ними. Вкладка монтировалась без единого пропса, а все её
 * пропсы необязательные, поэтому ни TypeScript, ни линтер, ни тесты не
 * возражали.
 *
 * @module food-tracker/hooks/useRecommendations
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    createCustomRecommendation,
    fetchRecommendations,
    updateNutrientPreferences,
    type RecommendationsData,
} from '../api/recommendationsApi';
import type { CustomRecommendation, NutrientRecommendation } from '../types';
import { t } from '@/shared/i18n';

// ============================================================================
// Types
// ============================================================================

export interface UseRecommendationsOptions {
    /** Загружать сразу. Выключается в тестах и когда вкладка не открыта. */
    enabled?: boolean;
}

export interface UseRecommendations {
    /** Все нутриенты справочника — для экрана настроек. */
    nutrients: NutrientRecommendation[];
    /** Только отслеживаемые — для вкладки. */
    trackedNutrients: NutrientRecommendation[];
    /** Идентификаторы отслеживаемых: текущий выбор на экране настроек. */
    trackedIds: string[];
    customRecommendations: CustomRecommendation[];
    currentIntakes: Record<string, number>;
    /**
     * Справочник нутриентов пуст.
     *
     * Это не то же самое, что «нечего показать»: справочник
     * `nutrient_recommendations` пуст и на dev, и на проде — таблицу создала
     * миграция 009, а строк в неё не добавил никто. Пустой экран без объяснения
     * неотличим от поломки, поэтому случай назван отдельно.
     */
    catalogueEmpty: boolean;
    isLoading: boolean;
    /** Текст ошибки загрузки, если она была. */
    error: string | null;
    /** Текст ошибки сохранения настроек или добавления своей рекомендации. */
    actionError: string | null;
    reload: () => void;
    /** Сохраняет полный набор отслеживаемых нутриентов. */
    savePreferences: (nutrientIds: string[]) => Promise<boolean>;
    /** Добавляет свою рекомендацию. */
    addCustomRecommendation: (
        recommendation: Omit<CustomRecommendation, 'id' | 'currentIntake'>
    ) => Promise<boolean>;
    clearActionError: () => void;
}

// ============================================================================
// Hook
// ============================================================================

const EMPTY: RecommendationsData = {
    nutrients: [],
    trackedIds: [],
    customRecommendations: [],
    currentIntakes: {},
};

export function useRecommendations({
    enabled = true,
}: UseRecommendationsOptions = {}): UseRecommendations {
    const [data, setData] = useState<RecommendationsData>(EMPTY);
    const [isLoading, setIsLoading] = useState(enabled);
    const [error, setError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [loadToken, setLoadToken] = useState(0);
    // Пока загрузки не было, «справочник пуст» и «мы ещё не спрашивали»
    // выглядели бы одинаково. Различать обязательно: первое надо объяснить
    // человеку, второе — просто дождаться.
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (!enabled) return;

        let cancelled = false;

        void (async () => {
            try {
                const next = await fetchRecommendations();
                if (cancelled) return;
                setData(next);
                setError(null);
                setLoaded(true);
            } catch {
                if (cancelled) return;
                // Что именно не удалось, человеку знать незачем; важно, что
                // показанное — не измерение, а отсутствие ответа.
                setError(t('foodTracker.recommendations.loadFailed'));
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [enabled, loadToken]);

    const reload = useCallback(() => {
        setIsLoading(true);
        setError(null);
        setLoadToken((token) => token + 1);
    }, []);

    const savePreferences = useCallback(async (nutrientIds: string[]): Promise<boolean> => {
        try {
            await updateNutrientPreferences(nutrientIds);
            // Прежний выбор остаётся видимым до успеха: показать новый раньше
            // ответа значило бы соврать о том, что сохранено.
            setData((current) => ({ ...current, trackedIds: nutrientIds }));
            setActionError(null);
            return true;
        } catch {
            setActionError(t('foodTracker.recommendations.saveFailed'));
            return false;
        }
    }, []);

    const addCustomRecommendation = useCallback(
        async (
            recommendation: Omit<CustomRecommendation, 'id' | 'currentIntake'>
        ): Promise<boolean> => {
            try {
                const created = await createCustomRecommendation(recommendation);
                setData((current) => ({
                    ...current,
                    customRecommendations: [created, ...current.customRecommendations],
                }));
                setActionError(null);
                return true;
            } catch {
                setActionError(t('foodTracker.recommendations.addFailed'));
                return false;
            }
        },
        []
    );

    const clearActionError = useCallback(() => setActionError(null), []);

    const trackedNutrients = useMemo(() => {
        const tracked = new Set(data.trackedIds);
        return data.nutrients.filter((nutrient) => tracked.has(nutrient.id));
    }, [data.nutrients, data.trackedIds]);

    return {
        nutrients: data.nutrients,
        trackedNutrients,
        trackedIds: data.trackedIds,
        customRecommendations: data.customRecommendations,
        currentIntakes: data.currentIntakes,
        catalogueEmpty: loaded && data.nutrients.length === 0,
        isLoading,
        error,
        actionError,
        reload,
        savePreferences,
        addCustomRecommendation,
        clearActionError,
    };
}

export default useRecommendations;
