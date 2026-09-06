'use client'

import { useState, useEffect, useCallback } from 'react'
import { getProfile, updateProfile, updateSettings, uploadAvatar, deleteAvatar } from '../api/settings'
import type { FullProfile, UserSettings } from '../api/settings'
import toast from 'react-hot-toast'
import { t } from '@/shared/i18n'

export function useSettings() {
    const [profile, setProfile] = useState<FullProfile | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    const loadProfile = useCallback(async () => {
        try {
            setIsLoading(true)
            const data = await getProfile()
            setProfile(data)
        } catch {
            toast.error(t('settings.profileLoadFailed'))
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        // Wrapped rather than called directly: the loader sets state, and from
        // the effect body that reads as a synchronous update.
        async function load() {
            await loadProfile()
        }
        load()
    }, [loadProfile])

    const saveSettings = useCallback(async (settings: Partial<UserSettings>) => {
        try {
            const result = await updateSettings(settings)
            setProfile(prev => prev ? { ...prev, settings: { ...prev.settings, ...result.settings } } : null)
            toast.success(t('settings.saved'))
        } catch (err: any) {
            const message = err?.response?.data?.message || t('settings.saveFailed')
            toast.error(message)
            throw err
        }
    }, [])

    const saveName = useCallback(async (name: string) => {
        try {
            const updated = await updateProfile({ name })
            setProfile(prev => prev ? { ...prev, name: updated.name } : null)
            toast.success(t('settings.nameUpdated'))
        } catch {
            toast.error(t('settings.nameUpdateFailed'))
        }
    }, [])

    const handleAvatarUpload = useCallback(async (file: File): Promise<string> => {
        const url = await uploadAvatar(file)
        setProfile(prev => prev ? { ...prev, avatar_url: url } : null)
        toast.success(t('settings.photoUpdated'))
        return url
    }, [])

    const handleAvatarDelete = useCallback(async () => {
        await deleteAvatar()
        setProfile(prev => prev ? { ...prev, avatar_url: '' } : null)
        toast.success(t('settings.photoRemoved'))
    }, [])

    return { profile, isLoading, loadProfile, saveName, saveSettings, handleAvatarUpload, handleAvatarDelete }
}
