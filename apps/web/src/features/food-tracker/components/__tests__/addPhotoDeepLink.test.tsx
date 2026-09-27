/**
 * Ссылка на распознавание по фото.
 *
 * Распознавание живёт внутри окна записи еды, а вкладка трекера была локальным
 * состоянием без поддержки URL. Поэтому пункт чек-листа «фото тарелки» ссылаться
 * на него не мог: ссылка приводила на вкладку рациона, откуда нужное искать три
 * клика вглубь. Пункт, который нельзя выполнить по ссылке из него самого, хуже
 * отсутствующего — отсюда ?add=photo.
 *
 * Здесь — второе звено: вкладка рациона открывает окно на нужном способе записи.
 * Разбор самого параметра проверяется в addPhotoDeepLinkPage.test.tsx.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { DietTab } from '../DietTab'
import type { FoodEntry, MealType } from '../../types'

jest.mock('react-hot-toast', () => ({ success: jest.fn(), error: jest.fn() }))

const noEntries: Record<MealType, FoodEntry[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
}

const totals = { calories: 0, protein: 0, fat: 0, carbs: 0 }

function renderDietTab(openEntryOn: 'photo' | null) {
    return render(
        <DietTab
            entries={noEntries}
            dailyTotals={totals}
            targetGoals={null}
            isLoading={false}
            onDeleteEntry={jest.fn().mockResolvedValue(true)}
            openEntryOn={openEntryOn}
        />
    )
}

describe('ссылка ?add=photo', () => {
    it('открывает окно записи сразу на распознавании по фото', () => {
        renderDietTab('photo')

        const photoTab = screen.getByRole('tab', { name: /фото/i })
        expect(photoTab).toHaveAttribute('aria-selected', 'true')
    })

    // Без указания окно само не открывается: иначе обычный заход на дневник
    // встречал бы человека модальным окном.
    it('без указания окно закрыто', () => {
        renderDietTab(null)

        expect(screen.queryByRole('tab', { name: /фото/i })).not.toBeInTheDocument()
    })
})
