/**
 * Серверные факты клиент не объявляет и не отправляет.
 *
 * `first_food_entry` прожил всю жизнь мёртвым: его отправляли со свойством
 * `meal_type`, которого для этого имени никогда не объявляли, и сервер отвергал
 * его на входе — а вместе с ним и весь пакет, то есть и первый
 * `food_entry_created` того же человека. На проде это выглядело как ноль
 * «первых записей» при тринадцати записях о еде.
 *
 * Теперь оба признака — серверные факты. Здесь закрепляется клиентская половина:
 * ни объявления, ни вызова. Серверная половина — `TestEventDictionariesMatch` и
 * интеграционные тесты модуля аналитики.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EVENTS } from '../events'

const SERVER_FACTS = [
    'registered',
    'email_verified',
    'signed_in',
    'curator_assigned',
    'weekly_report_submitted',
    'support_escalated',
    'first_food_entry',
    'first_curator_message',
]

describe('серверные факты на клиенте', () => {
    it('не объявлены в словаре', () => {
        const declared = Object.values(EVENTS) as string[]
        SERVER_FACTS.forEach((name) => {
            expect(declared).not.toContain(name)
        })
    })

    // Разбивка по способу записи остаётся там, где её знает браузер.
    it('соседнее событие о записи еды осталось клиентским', () => {
        expect(Object.values(EVENTS)).toContain('food_entry_created')
    })

    // Читается исходник, а не поведение: отметка в localStorage и была причиной,
    // по которой один человек считался новым дважды, и её возвращение должно
    // ронять тест, а не ждать проверки на живом устройстве.
    it('в дневнике питания не осталось отметки о первой записи', () => {
        const source = readFileSync(
            join(__dirname, '../../../features/food-tracker/store/entriesSlice.ts'),
            'utf8',
        )

        expect(source).not.toContain('first_food_entry')
        expect(source).not.toContain('FIRST_ENTRY_KEY')
        expect(source).toContain('EVENTS.foodEntryCreated')
    })

    it('в чате не осталось отметки о первом сообщении', () => {
        const source = readFileSync(
            join(__dirname, '../../../features/chat/hooks/useChat.ts'),
            'utf8',
        )

        expect(source).not.toContain('first_curator_message')
        expect(source).not.toContain('FIRST_MESSAGE_KEY')
        expect(source).not.toContain('EVENTS.')
    })
})
