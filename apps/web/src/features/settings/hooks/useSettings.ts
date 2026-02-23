'use client'

import { useState, useEffect, useCallback } from 'react'
import { getProfile, updateSettings, uploadAvatar, deleteAvatar } from '../api/settings'
import type { FullProfile, UserSettings } from '../api/settings'
import toast from 'react-hot-toast'

export function useSettings() {
    const [profile, setProfile] = useState<FullProfile | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    const loadProfile = useCallback(async () => {
        try {
            setIsLoading(true)
            const data = await getProfile()
            setProfile(data)
        } catch {
            toast.error('Не удалось загрузить профиль')
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => { loadProfile() }, [loadProfile])

    const saveSettings = useCallback(async (settings: Partial<UserSettings>) => {
        try {
            const result = await updateSettings(settings)
            setProfile(prev => prev ? { ...prev, settings: { ...prev.settings, ...result.settings } } : null)
            toast.success('Настройки сохранены')
        } catch {
            toast.error('Не удалось сохранить настройки')
        }
    }, [])

    const handleAvatarUpload = useCallback(async (file: File): Promise<string> => {
        const url = await uploadAvatar(file)
        setProfile(prev => prev ? { ...prev, avatar_url: url } : null)
        toast.success('Фото обновлено')
        return url
    }, [])

    const handleAvatarDelete = useCallback(async () => {
        await deleteAvatar()
        setProfile(prev => prev ? { ...prev, avatar_url: '' } : null)
        toast.success('Фото удалено')
    }, [])

    return { profile, isLoading, loadProfile, saveSettings, handleAvatarUpload, handleAvatarDelete }
}
