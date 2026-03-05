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
