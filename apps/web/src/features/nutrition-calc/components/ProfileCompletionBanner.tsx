'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { getProfile } from '@/features/settings/api/settings'

export function ProfileCompletionBanner() {
    const [show, setShow] = useState(false)

    useEffect(() => {
        const dismissed = localStorage.getItem('kbju_banner_dismissed')
        if (dismissed) {
            const dismissedAt = new Date(dismissed)
            const threeDaysAgo = new Date()
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
            if (dismissedAt > threeDaysAgo) return
        }

        getProfile().then(profile => {
            const s = profile.settings
            if (!s?.birth_date || !s?.biological_sex || !s?.height) {
                setShow(true)
            }
        }).catch(() => {})
    }, [])

    if (!show) return null

    return (
        <div className="mb-4 flex items-center justify-between rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-indigo-800">
                <span>Заполните профиль для автоматического расчёта КБЖУ</span>
                <Link href="/settings/body" className="font-semibold underline hover:text-indigo-600">
                    Заполнить
                </Link>
            </div>
            <button
                onClick={() => {
                    setShow(false)
                    localStorage.setItem('kbju_banner_dismissed', new Date().toISOString())
                }}
                className="text-indigo-400 hover:text-indigo-600"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    )
}
