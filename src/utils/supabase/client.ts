// Создаем клиент для общения с базой
import { createBrowserClient } from '@supabase/ssr'
import { logger } from '@/utils/logger'

export function createClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
        logger.error('Supabase: отсутствуют переменные окружения', undefined, {
            hasUrl: !!supabaseUrl,
            hasKey: !!supabaseKey,
        })
        throw new Error('Supabase configuration is missing')
    }

    logger.debug('Supabase: создание клиента')
    
    return createBrowserClient(supabaseUrl, supabaseKey)
}

