'use client'

import { useEffect, useState } from 'react'

interface Settled<T> {
    load: () => Promise<T>
    version: number
    data?: T
    error?: unknown
}

export interface Resource<T> {
    data: T | undefined
    error: unknown
    loading: boolean
    /** Загрузить заново тем же загрузчиком. */
    reload: () => void
    /** Положить ответ мутации как текущие данные, без повторного запроса. */
    replace: (data: T) => void
}

/**
 * Одна загрузка на загрузчик.
 *
 * Загрузчик должен быть стабильным (`useCallback` с ключом — id, а не
 * объектом): новый загрузчик — новый запрос. Ожидание выводится из того, для
 * какого загрузчика пришёл ответ, а не ставится в эффекте: синхронный setState
 * в эффекте — лишний проход отрисовки, и линтер его не пропускает.
 */
export function useResource<T>(load: (() => Promise<T>) | null): Resource<T> {
    const [settled, setSettled] = useState<Settled<T> | null>(null)
    const [version, setVersion] = useState(0)

    useEffect(() => {
        if (!load) return
        let active = true
        load().then(
            (data) => {
                if (active) setSettled({ load, version, data })
            },
            (error: unknown) => {
                if (active) setSettled({ load, version, error })
            }
        )
        return () => {
            active = false
        }
    }, [load, version])

    const sameLoader = !!load && settled?.load === load
    const current = sameLoader && settled?.version === version ? settled : null

    return {
        // Пока идёт повторная загрузка, на экране остаются прежние данные.
        data: sameLoader ? settled?.data : undefined,
        error: current?.error,
        loading: !!load && !current,
        reload: () => setVersion((v) => v + 1),
        replace: (data: T) => {
            if (load) setSettled({ load, version, data })
        },
    }
}
