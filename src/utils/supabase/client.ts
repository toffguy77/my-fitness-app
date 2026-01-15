// Создаем клиент для общения с базой
import { createBrowserClient } from '@supabase/ssr'
import { logger } from '@/utils/logger'

export function createClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    // Check if we're in build time with placeholder values
    const isPlaceholder = supabaseUrl?.includes('placeholder') || supabaseKey?.includes('placeholder')

    if (!supabaseUrl || !supabaseKey) {
        logger.error('Supabase: отсутствуют переменные окружения', undefined, {
            hasUrl: !!supabaseUrl,
            hasKey: !!supabaseKey,
        })

        // During build time, return a mock client to prevent build failures
        if (typeof window === 'undefined') {
            return createBrowserClient(
                'https://placeholder.supabase.co',
                'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxMjM0NTYsImV4cCI6MTk2MDY5OTQ1Nn0.placeholder-key'
            )
        }

        throw new Error('Supabase configuration is missing')
    }

    // During build time with placeholder values, use them to prevent build failures
    if (isPlaceholder && typeof window === 'undefined') {
        logger.debug('Supabase: используются placeholder значения для сборки')
        return createBrowserClient(supabaseUrl, supabaseKey)
    }

    logger.debug('Supabase: создание клиента')

    return createBrowserClient(supabaseUrl, supabaseKey)
}
