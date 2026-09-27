export interface CalculatedTargets {
    calories: number
    protein: number
    fat: number
    carbs: number
    bmr: number
    tdee: number
    workout_bonus: number
    weight_used: number
    source: 'calculated' | 'curator_override'
}

/**
 * Чего не хватает для расчёта нормы.
 *
 * Два условия заполняются на разных экранах: пол, дата рождения и рост — в
 * «Теле и целях», вес — в метриках дня. Поэтому сервер называет их по
 * отдельности: «профиль не заполнен или нет данных о весе» одной фразой не даёт
 * кнопке «Посчитать норму» адреса, а вес в «Теле и целях» показан только для
 * чтения.
 */
export interface MissingTargetInputs {
    profile: boolean
    weight: boolean
}

/** Ответ на запрос нормы: либо она есть, либо сказано, чего для неё не хватает. */
export interface TargetsAnswer {
    targets: CalculatedTargets | null
    missing: MissingTargetInputs | null
}

export interface ActualIntake {
    calories: number
    protein: number
    fat: number
    carbs: number
}

export interface TargetVsActual {
    date: string
    target: CalculatedTargets | null
    actual: ActualIntake | null
    workout_bonus: number
    source: string
}

export interface HistoryResponse {
    days: TargetVsActual[]
}
