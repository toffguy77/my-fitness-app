// Server Action для обновления nutrition_targets с валидацией
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { validateNutritionTargets } from '@/utils/validation/nutrition'
import { logger } from '@/utils/logger'
import { z } from 'zod'

// Zod схема для валидации
const nutritionTargetsSchema = z.object({
  targetId: z.string().uuid(),
  calories: z.number().min(1000).max(6000),
  protein: z.number().min(20).max(500),
  fats: z.number().min(20).max(200),
  carbs: z.number().min(20).max(500),
  clientId: z.string().uuid()
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Проверяем, что пользователь - тренер или super_admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, coach_id')
      .eq('id', user.id)
      .single()

    if (!profile || (profile.role !== 'coach' && profile.role !== 'super_admin')) {
      return NextResponse.json(
        { error: 'Forbidden: Only coaches can update nutrition targets' },
        { status: 403 }
      )
    }

    const body = await request.json()

    // Валидация через Zod
    const validationResult = nutritionTargetsSchema.safeParse(body)
    if (!validationResult.success) {
      logger.warn('NutritionTargets: ошибка валидации Zod', {
        userId: user.id,
        errors: validationResult.error.issues
      })
      return NextResponse.json(
        { error: 'Invalid input', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const { targetId, calories, protein, fats, carbs, clientId } = validationResult.data

    // Проверяем, что тренер имеет доступ к этому клиенту
    if (profile.role === 'coach') {
      const { data: clientProfile } = await supabase
        .from('profiles')
        .select('coach_id')
        .eq('id', clientId)
        .single()

      if (!clientProfile || clientProfile.coach_id !== user.id) {
        return NextResponse.json(
          { error: 'Forbidden: Client not assigned to this coach' },
          { status: 403 }
        )
      }
    }

    // Дополнительная валидация через нашу функцию
    const customValidation = validateNutritionTargets({ calories, protein, fats, carbs })
    if (!customValidation.valid) {
      logger.warn('NutritionTargets: ошибка валидации (unsafe values)', {
        userId: user.id,
        clientId,
        errors: customValidation.errors
      })
      return NextResponse.json(
        { error: 'Unsafe values detected', details: customValidation.errors },
        { status: 400 }
      )
    }

    // Обновляем цели
    const { error: updateError } = await supabase
      .from('nutrition_targets')
      .update({
        calories,
        protein,
        fats,
        carbs,
        updated_at: new Date().toISOString()
      })
      .eq('id', targetId)
      .eq('user_id', clientId)

    if (updateError) {
      logger.error('NutritionTargets: ошибка обновления', updateError, {
        userId: user.id,
        clientId,
        targetId
      })
      return NextResponse.json(
        { error: 'Failed to update nutrition targets' },
        { status: 500 }
      )
    }

    logger.info('NutritionTargets: цели успешно обновлены', {
      userId: user.id,
      clientId,
      targetId,
      calories,
      protein,
      fats,
      carbs
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('NutritionTargets: исключение при обновлении', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

