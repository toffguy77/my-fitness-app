/**
 * The goal list in the counter has to match MIRRORED_EVENTS in the code. A
 * goal created by hand under a different name is never reached, and zero
 * conversions looks exactly like no traffic — so the drift is invisible.
 *
 * Run: node --test scripts/__tests__/metrika-goals.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { declaredGoals, difference } from '../metrika-goals.mjs'

test('reads the mirrored names out of the source of truth', () => {
    const goals = declaredGoals()

    assert.ok(goals.length > 0, 'ни одной объявленной цели')
    assert.ok(goals.includes('onboarding_started'))
    assert.ok(goals.includes('lead_saved'))
    // Not mirrored: four events per visit would turn the report into noise.
    assert.ok(!goals.includes('landing_scroll_depth'))
})

test('refuses a mirrored name the dictionary does not declare', () => {
    const broken = `
        export const EVENTS = { landingViewed: 'landing_viewed' } as const
        export const MIRRORED_EVENTS = [EVENTS.landingViewed, EVENTS.invented]
    `

    assert.throws(() => declaredGoals(broken), /invented/)
})

// Сценарий «Запуск без изменений»: расхождение названо, ничего не тронуто.
test('names what is missing without touching anything', () => {
    const diff = difference(
        ['landing_viewed', 'lead_saved'],
        [{ id: 1, name: 'landing_viewed', is_retargeting: 1 }],
    )

    assert.deepEqual(diff.missing, ['lead_saved'])
    assert.deepEqual(diff.notInDirect, [])
    assert.deepEqual(diff.stale, [])
})

// Признак ретаргетинга владельцу счётчика не принадлежит: цель становится
// условием подбора аудитории, когда её выбирают в кампании Директа. Скрипт
// сообщает об этом, но исправить не может — и не пытается.
test('names a declared goal nobody has picked up in Direct yet', () => {
    const diff = difference(
        ['landing_viewed'],
        [{ id: 1, name: 'landing_viewed', is_retargeting: 0 }],
    )

    assert.deepEqual(diff.missing, [])
    assert.equal(diff.notInDirect.length, 1)
    assert.equal(diff.notInDirect[0].name, 'landing_viewed')
})

// Автоцели счётчика попадают сюда. Они называются, но не удаляются: за целью с
// историей стоит чей-то отчёт, и сносить её — решение с последствиями, которых
// скрипту не взвесить.
test('reports the goals it did not expect, and leaves them alone', () => {
    const diff = difference(
        ['landing_viewed'],
        [
            { id: 1, name: 'landing_viewed', is_retargeting: 1 },
            { id: 2, name: 'Автоцель: отправка формы', is_retargeting: 0 },
        ],
    )

    assert.deepEqual(diff.missing, [])
    assert.equal(diff.stale.length, 1)
    assert.equal(diff.stale[0].name, 'Автоцель: отправка формы')
})

// Сценарий «Повторное применение»: второй проход не находит работы.
test('finds nothing to do once the counter matches', () => {
    const declared = declaredGoals()
    const existing = declared.map((name, i) => ({ id: i + 1, name, is_retargeting: 1 }))

    const diff = difference(declared, existing)

    assert.deepEqual(diff.missing, [])
    assert.deepEqual(diff.notInDirect, [])
    assert.deepEqual(diff.stale, [])
})
