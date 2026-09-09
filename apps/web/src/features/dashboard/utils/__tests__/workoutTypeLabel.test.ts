import { workoutTypeLabel, workoutTypeCode } from '../workoutTypeLabel'

describe('workoutTypeLabel', () => {
    it('names the codes stored today', () => {
        expect(workoutTypeLabel('strength')).toBe('Силовая')
        expect(workoutTypeLabel('cardio')).toBe('Кардио')
        expect(workoutTypeLabel('hiit')).toBe('HIIT')
        expect(workoutTypeLabel('cycling')).toBe('Велосипед')
    })

    // A page open when the migration runs is reading rows it was not
    // redeployed for.
    it('still names the words stored before migration 062', () => {
        expect(workoutTypeLabel('Силовая')).toBe('Силовая')
        expect(workoutTypeLabel('Велосипед')).toBe('Велосипед')
    })

    // "Другое" is replaced by whatever the person typed, and that is theirs.
    it('shows somebody’s own words as they wrote them', () => {
        expect(workoutTypeLabel('Танцы')).toBe('Танцы')
        expect(workoutTypeLabel('Скалолазание с другом')).toBe('Скалолазание с другом')
    })
})

describe('workoutTypeCode', () => {
    it('turns a stored Russian word back into its code', () => {
        expect(workoutTypeCode('Силовая')).toBe('strength')
        expect(workoutTypeCode('HIIT')).toBe('hiit')
        expect(workoutTypeCode('Другое')).toBe('other')
    })

    it('leaves a code alone', () => {
        expect(workoutTypeCode('running')).toBe('running')
    })

    // Without this the edit form would find nothing selected for a day saved
    // before the migration, and then save the workout as if the person had
    // typed its name by hand.
    it('leaves somebody’s own words alone', () => {
        expect(workoutTypeCode('Танцы')).toBe('Танцы')
    })
})
