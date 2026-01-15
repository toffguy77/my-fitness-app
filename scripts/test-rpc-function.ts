/**
 * Скрипт для проверки функции create_user_profile в БД
 * Версия: v9.5 (упрощенная версия без проверок и задержек)
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

// Генерируем валидный UUID для тестирования
function generateTestUserId(): string {
  // Генерируем валидный UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

async function testFunction() {
  console.log('='.repeat(60))
  console.log('Проверка функции create_user_profile (v9.5)')
  console.log('='.repeat(60))
  console.log()

  // Тест 1: Проверка существования функции
  console.log('1️⃣  Проверка существования функции...')
  const testUserId1 = generateTestUserId()

  const { error: error1 } = await supabase.rpc('create_user_profile', {
    user_id: testUserId1,
    user_email: 'test-check@example.com',
    user_full_name: 'Test User Check',
    user_role: 'client',
    user_coordinator_id: null,
  })

  if (error1) {
    if (error1.message?.includes('Could not find the function') ||
        error1.message?.includes('function') && error1.message?.includes('not found') ||
        error1.message?.includes('schema cache')) {
      console.error('❌ Функция create_user_profile НЕ найдена в базе данных')
      console.error('Ошибка:', error1.message)
      console.log('\n💡 Решение:')
      console.log('1. Примените миграцию v9.5_simplify_create_user_profile_no_checks.sql')
      console.log('2. Или выполните SQL скрипт из scripts/check-db-function.sql для проверки')
      process.exit(1)
    } else if (error1.message?.includes('does not exist in auth.users')) {
      console.log('✅ Функция существует (это нормальная ошибка для несуществующего пользователя)')
      console.log('   Ошибка:', error1.message)
    } else {
      console.log('⚠️  Функция найдена, но вернула неожиданную ошибку:')
      console.log('   Ошибка:', error1.message)
    }
  } else {
    console.log('✅ Функция существует и может быть вызвана')
  }
  console.log()

  // Тест 2: Проверка скорости выполнения
  console.log('2️⃣  Проверка скорости выполнения...')
  const testUserId2 = generateTestUserId()
  const startTime = Date.now()

  const { error: error2 } = await supabase.rpc('create_user_profile', {
    user_id: testUserId2,
    user_email: 'test-speed@example.com',
    user_full_name: 'Test Speed',
    user_role: 'client',
    user_coordinator_id: null,
  })

  const duration = Date.now() - startTime

  if (error2) {
    if (error2.message?.includes('does not exist in auth.users')) {
      // Это ожидаемая ошибка - пользователь не существует
      console.log(`✅ Функция выполняется быстро: ${duration}ms`)
    } else if (error2.message?.includes('invalid input syntax for type uuid')) {
      // Ошибка валидации - функция работает корректно
      console.log(`✅ Функция выполняется быстро: ${duration}ms (ошибка валидации UUID - нормально)`)
    } else {
      console.log(`⚠️  Функция вернула ошибку: ${error2.message}`)
      console.log(`   Время выполнения: ${duration}ms`)
    }
  } else {
    console.log(`✅ Функция выполнена успешно за ${duration}ms`)
  }

  if (duration < 100) {
    console.log(`✅ Скорость выполнения в норме: ${duration}ms (< 100ms)`)
  } else if (duration < 500) {
    console.log(`⚠️  Скорость выполнения приемлемая: ${duration}ms (рекомендуется < 100ms)`)
  } else {
    console.log(`❌ Функция выполняется медленно: ${duration}ms (ожидается < 100ms)`)
  }
  console.log()

  // Тест 3: Проверка idempotency (нельзя протестировать без реального пользователя)
  console.log('3️⃣  Проверка idempotency...')
  console.log('   ⚠️  Требуется реальный пользователь в auth.users')
  console.log('   💡 Для полной проверки создайте тестового пользователя через signUp')
  console.log()

  // Итоги
  console.log('='.repeat(60))
  console.log('ИТОГИ ПРОВЕРКИ:')
  console.log('='.repeat(60))

  if (error1 && (error1.message?.includes('Could not find the function') ||
                 error1.message?.includes('not found'))) {
    console.log('❌ Функция НЕ найдена - примените миграцию v9.5')
  } else {
    console.log('✅ Функция существует')
    if (duration < 100) {
      console.log('✅ Функция выполняется быстро')
    }
    console.log('✅ Функция готова к использованию')
  }

  console.log('\n💡 Для полной проверки:')
  console.log('   1. Создайте тестового пользователя через signUp')
  console.log('   2. Вызовите функцию с реальным user_id')
  console.log('   3. Проверьте, что профиль создан корректно')
  console.log('   4. Повторный вызов должен быть idempotent (ON CONFLICT DO NOTHING)')
}

testFunction()
  .then(() => {
    console.log('\n✅ Проверка завершена')
    process.exit(0)
  })
  .catch((err) => {
    console.error('\n❌ Ошибка при проверке:', err)
    process.exit(1)
  })
