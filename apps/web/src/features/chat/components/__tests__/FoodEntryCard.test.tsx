import { render, screen } from '@testing-library/react'
import { FoodEntryCard } from '../FoodEntryCard'

describe('FoodEntryCard', () => {
    const fullMetadata = {
        food_name: 'Куриная грудка',
        meal_type: 'lunch',
        weight: 200,
        calories: 330,
        protein: 31,
        fat: 3.6,
        carbs: 0,
    }

    it('renders food name', () => {
        render(<FoodEntryCard metadata={fullMetadata} />)
        expect(screen.getByText('Куриная грудка')).toBeInTheDocument()
    })

    it('renders meal type with Russian label', () => {
        render(<FoodEntryCard metadata={fullMetadata} />)
        expect(screen.getByText('Обед')).toBeInTheDocument()
    })

    it('renders all meal type labels correctly', () => {
        const mealTypes = [
            { type: 'breakfast', label: 'Завтрак' },
            { type: 'dinner', label: 'Ужин' },
            { type: 'snack', label: 'Перекус' },
        ]

        for (const { type, label } of mealTypes) {
            const { unmount } = render(
                <FoodEntryCard metadata={{ ...fullMetadata, meal_type: type }} />
            )
            expect(screen.getByText(label)).toBeInTheDocument()
            unmount()
        }
    })

    it('renders weight in grams', () => {
        render(<FoodEntryCard metadata={fullMetadata} />)
        expect(screen.getByText('200 г')).toBeInTheDocument()
    })

    it('renders KBZHU values', () => {
        render(<FoodEntryCard metadata={fullMetadata} />)
        expect(screen.getByText('330')).toBeInTheDocument()  // calories
        expect(screen.getByText('ккал')).toBeInTheDocument()
        expect(screen.getByText('31')).toBeInTheDocument()   // protein
        expect(screen.getByText('Б')).toBeInTheDocument()
        expect(screen.getByText('3.6')).toBeInTheDocument()  // fat
        expect(screen.getByText('Ж')).toBeInTheDocument()
        expect(screen.getByText('0')).toBeInTheDocument()    // carbs
        expect(screen.getByText('У')).toBeInTheDocument()
    })

    it('renders nothing when metadata is undefined', () => {
        const { container } = render(<FoodEntryCard metadata={undefined} />)
        expect(container.innerHTML).toBe('')
    })

    it('handles missing fields with defaults', () => {
        render(<FoodEntryCard metadata={{}} />)
        expect(screen.getByText('Продукт')).toBeInTheDocument() // default food name
    })
})
