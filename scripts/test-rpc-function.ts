/**
 * Скрипт для проверки существования функции create_user_profile в БД
 * Запуск: npx tsx scripts/test-rpc-function.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Ошибка: NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY должны быть установлены')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkFunction() {
  console.log('Проверка существования функции create_user_profile...\n')

  // Пробуем вызвать функцию с тестовыми параметрами
  // Если функция не существует, получим ошибку
  const { data, error } = await supabase.rpc('create_user_profile', {
    user_id: 'test-user-id',
    user_email: 'test@example.com',
    user_full_name: 'Test User',
    user_role: 'client',
    user_coordinator_id: null,
  })

  if (error) {
    if (error.message?.includes('Could not find the function') || 
        error.message?.includes('function') && error.message?.includes('not found')) {
      console.error('❌ Функция create_user_profile НЕ найдена в базе данных')
      console.error('Ошибка:', error.message)
      console.log('\n💡 Решение:')
      console.log('1. Проверьте SQL скрипт в scripts/check-db-function.sql')
      console.log('2. Убедитесь, что функция создана в Supabase Dashboard -> SQL Editor')
      console.log('3. Или используйте прямой insert (код уже поддерживает это)')
    } else {
      console.log('✅ Функция найдена, но вернула ошибку (это нормально для тестового вызова)')
      console.log('Ошибка:', error.message)
      console.log('Это означает, что функция существует, но параметры неверны или есть другие проблемы')
    }
  } else {
    console.log('✅ Функция существует и может быть вызвана')
    console.log('Результат:', data)
  }
}

checkFunction()
  .then(() => {
    console.log('\nПроверка завершена')
    process.exit(0)
  })
  .catch((err) => {
    console.error('Ошибка при проверке:', err)
    process.exit(1)
  })

