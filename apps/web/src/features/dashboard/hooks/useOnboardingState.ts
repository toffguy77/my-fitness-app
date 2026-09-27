'use client'

import { useCallback, useEffect, useState } from 'react'
import { dashboardApi } from '../api/dashboardApi'
import type { OnboardingState } from '../types'

export interface OnboardingAnswer {
    /** Состояние первого экрана, или null — ответа ещё или уже нет. */
    state: OnboardingState | null
    isLoading: boolean
    /**
     * Запрос не удался. Отдельно от `state === null`: «куратор не назначен» и
     * «ответ не получен» — разные утверждения, и путать их значит врать
     * человеку про его учётную запись.
     */
    hasError: boolean
    reload: () => void
}

/**
 * Состояние первого экрана — один запрос на чек-лист и карточку куратора.
 *
 * Оба блока показываются и скрываются вместе, поэтому и ответ у них общий: двумя
 * запросами получилось бы состояние, в котором один блок уже знает ответ, а
 * второй ещё нет, и первый экран на мгновение противоречил бы сам себе.
 *
 * `enabled` выключает запрос там, где спрашивать не о чем. Ручка адресована
 * клиенту и остальным отвечает отказом, а `middleware` проверяет только вход, не
 * роль — то есть куратор на клиентский дашборд попасть может. Без этого флага он
 * увидел бы в карточке вечную ошибку загрузки вместо ничего.
 */
export function useOnboardingState(enabled: boolean = true): OnboardingAnswer {
    const [state, setState] = useState<OnboardingState | null>(null)
    const [isLoading, setIsLoading] = useState(enabled)
    const [hasError, setHasError] = useState(false)
    const [attempt, setAttempt] = useState(0)

    // Повтор помечает ожидание здесь, в обработчике, а не в эффекте: снимок
    // состояния внутри эффекта запускал бы каскад перерисовок, о чём и
    // предупреждает react-hooks/set-state-in-effect.
    const reload = useCallback(() => {
        setIsLoading(true)
        setAttempt((n) => n + 1)
    }, [])

    useEffect(() => {
        if (!enabled) return
        let cancelled = false

        dashboardApi
            .getOnboardingState()
            .then((answer) => {
                if (cancelled) return
                setState(answer)
                setHasError(false)
            })
            .catch(() => {
                if (cancelled) return
                // Прошлый ответ не сохраняется: показывать устаревший чек-лист
                // как текущий значит утверждать о действиях человека то, чего мы
                // сейчас не знаем.
                setState(null)
                setHasError(true)
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [attempt, enabled])

    return { state, isLoading, hasError, reload }
}
