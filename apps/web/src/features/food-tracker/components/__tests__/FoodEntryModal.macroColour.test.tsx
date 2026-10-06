/**
 * Цвет нутриента в окне записи еды.
 *
 * Подписи полей КБЖУ здесь были `text-fg-subtle` — то есть окно записи, самый
 * частый экран у новичка, не имело ни одного цвета нутриента. Ожидаемые значения
 * берутся из того же модуля, что и реализация: второй цвет жиров уронит этот
 * тест, а не доживёт до прода, как нынешнее расхождение `#f59e0b` против
 * `#eab308`.
 */

import React from 'react'
import { render, fireEvent } from '@testing-library/react'
import { FoodEntryModal } from '../FoodEntryModal'
import type { FoodEntry } from '../../types'
import { MACRO_COLORS } from '@/shared/constants/macros'
import { hexToRgb } from '@/shared/testing/cssColor'

const editingEntry: FoodEntry = {
    id: 'entry-1',
    foodId: 'food-1',
    foodName: 'Овсянка',
    mealType: 'breakfast',
    portionType: 'grams',
    portionAmount: 100,
    nutrition: { calories: 380, protein: 12, fat: 6, carbs: 65 },
    time: '08:00',
    date: '2026-09-27',
    createdAt: '2026-09-27T08:00:00.000Z',
    updatedAt: '2026-09-27T08:00:00.000Z',
}

describe('FoodEntryModal — цвет нутриента', () => {
    it('опознаёт белки, жиры и углеводы цветом в полях КБЖУ', () => {
        const { container } = render(
            <FoodEntryModal isOpen onClose={jest.fn()} editingEntry={editingEntry} />
        )

        // Карандашей на экране несколько; нужен тот, что в блоке сведений о
        // продукте — он и открывает поля КБЖУ.
        const pencil = container.querySelector<HTMLButtonElement>(
            '.bg-canvas button[aria-label="Редактировать"]'
        )
        expect(pencil).not.toBeNull()
        fireEvent.click(pencil!)

        const dots = Array.from(
            container.querySelectorAll<HTMLElement>('label span[aria-hidden="true"]')
        ).map((el) => el.style.backgroundColor)

        expect(dots).toEqual([
            hexToRgb(MACRO_COLORS.protein),
            hexToRgb(MACRO_COLORS.fat),
            hexToRgb(MACRO_COLORS.carbs),
        ])
    })
})
