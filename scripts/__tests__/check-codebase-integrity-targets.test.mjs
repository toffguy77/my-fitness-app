/**
 * Правило против придуманной нормы КБЖУ.
 *
 * `calcTargets?.calories || 2000` — валидный TypeScript, и именно так человеку с
 * незаполненным профилем показывали 2000 ккал и 150 г белка как его личную норму.
 * На проде такую норму видели 16 клиентов из 18. Тип, допускающий отсутствие
 * нормы, ловит пропущенную ветвь; это правило ловит заполненную неправдой.
 *
 * Проверка запускает настоящий скрипт против настоящего репозитория, подкладывая
 * на время один файл-образец: игрушечного каталога не хватит, скрипт читает
 * docker-compose.yml и конфиг сервера.
 *
 * Запуск: node --test scripts/__tests__/check-codebase-integrity-targets.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRIPT = join(REPO, 'scripts', 'check-codebase-integrity.mjs')
const FIXTURE_DIR = join(REPO, 'apps/web/src/features/food-tracker/__integrity_fixture__')
const FIXTURE = join(FIXTURE_DIR, 'goals.ts')

function run() {
    const result = spawnSync(process.execPath, [SCRIPT], { cwd: REPO, encoding: 'utf8' })
    return { status: result.status, out: result.stdout + result.stderr }
}

function withFixture(source, assertion) {
    mkdirSync(FIXTURE_DIR, { recursive: true })
    writeFileSync(FIXTURE, source)
    try {
        assertion(run())
    } finally {
        rmSync(FIXTURE_DIR, { recursive: true, force: true })
    }
}

test('кодовая база проходит правило', () => {
    const { status, out } = run()
    assert.equal(status, 0, out)
})

test('запасное число на месте нормы ломает сборку и называет место', () => {
    withFixture(
        'export function goals(calcTargets?: { calories: number }) {\n' +
            '    return { caloriesGoal: calcTargets?.calories || 2000 }\n' +
            '}\n',
        ({ status, out }) => {
            assert.equal(status, 1, out)
            assert.match(out, /Придуманная норма КБЖУ/)
            assert.match(out, /__integrity_fixture__\/goals\.ts:2/)
            assert.match(out, /оставьте null/)
        },
    )
})

test('`??` ловится так же, как `||`', () => {
    withFixture(
        'export const proteinGoal = (t?: { protein: number }) => t?.protein ?? 150\n',
        ({ status, out }) => {
            assert.equal(status, 1, out)
            assert.match(out, /Придуманная норма КБЖУ/)
        },
    )
})

test('ноль запасным значением — не придуманная норма', () => {
    // «Съедено нисколько» — измерение. «Норма 2000» — догадка.
    withFixture(
        'export const eaten = (day?: { calories: number }) => day?.calories ?? 0\n',
        ({ status, out }) => {
            assert.equal(status, 0, out)
        },
    )
})

test('комментарий, объясняющий прежний дефект, правило не роняет', () => {
    // Сторож уже сработал на таком комментарии в NutritionBlock.tsx. Правило,
    // падающее на объяснении самого себя, отключают.
    withFixture(
        '// Раньше здесь стояло `calcTargets?.calories || 2000`, и это показывалось\n' +
            '// человеку как его норма.\n' +
            '/* То же и блочным комментарием: proteinGoal ?? 150 */\n' +
            'export const nothing = 1\n',
        ({ status, out }) => {
            assert.equal(status, 0, out)
        },
    )
})
