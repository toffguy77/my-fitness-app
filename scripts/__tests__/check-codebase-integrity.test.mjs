/**
 * Два правила `check-codebase-integrity.mjs`, появившиеся из обратной связи по
 * багам: роль из локального слепка и придуманная норма КБЖУ.
 *
 * ## Почему всё в одном файле
 *
 * Оба правила проверяются запуском настоящего скрипта против настоящего
 * репозитория: скрипт читает `docker-compose.yml` и конфиг сервера, игрушечного
 * каталога ему не хватит. Значит каждая проверка на время подкладывает в дерево
 * файл-образец и потом его убирает.
 *
 * Двумя файлами это не работает. `node --test` запускает файлы параллельно, и
 * сканер одного прогона читал список файлов, в котором был образец другого, — а
 * к моменту чтения тот уже удалили. Скрипт падал с `ENOENT` внутри теста,
 * который к образцу отношения не имел. В CI это выглядело как
 * «ноль запасным значением — не придуманная норма: ENOENT ... app/__integrity_fixture__».
 *
 * Тесты внутри одного файла идут последовательно, поэтому здесь они и живут.
 * Само дерево скрипт теперь тоже переносит спокойнее — файл, исчезнувший во
 * время обхода, пропускается, — но это защита, а не причина: причина была в
 * двух файлах.
 *
 * Запуск: node --test scripts/__tests__/check-codebase-integrity.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRIPT = join(REPO, 'scripts', 'check-codebase-integrity.mjs')

function run() {
    const result = spawnSync(process.execPath, [SCRIPT], { cwd: REPO, encoding: 'utf8' })
    return { status: result.status, out: result.stdout + result.stderr }
}

/** Кладёт файл-образец, прогоняет скрипт, убирает образец в любом случае. */
function withFixture(relativeDir, fileName, source, assertion) {
    const dir = join(REPO, relativeDir)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, fileName), source)
    try {
        assertion(run())
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
}

const APP_FIXTURE = 'apps/web/src/app/__integrity_fixture__'
const TRACKER_FIXTURE = 'apps/web/src/features/food-tracker/__integrity_fixture__'

test('кодовая база проходит все правила', () => {
    const { status, out } = run()
    assert.equal(status, 0, out)
})

// --- Роль из локального слепка -----------------------------------------------
//
// `/profile` и `/settings/*` выбирали оболочку по `localStorage['user']` с
// запасным значением `'client'`, и куратор при пустом или устаревшем слепке
// получал клиентскую навигацию. Дефект нашёл пользователь, а не сборка.

test('новое чтение роли из хранилища ломает сборку и называет место', () => {
    withFixture(
        APP_FIXTURE,
        'page.tsx',
        "'use client'\n" +
            'export default function Page() {\n' +
            "    const role = JSON.parse(localStorage.getItem('user') || '{}').role || 'client'\n" +
            '    return <div>{role}</div>\n' +
            '}\n',
        ({ status, out }) => {
            assert.equal(status, 1, out)
            assert.match(out, /Роль читается из локального хранилища/)
            assert.match(out, /__integrity_fixture__\/page\.tsx:3/)
            assert.match(out, /useCurrentUser/)
        },
    )
})

test('чтение роли в две строки тоже ловится', () => {
    withFixture(
        APP_FIXTURE,
        'page.tsx',
        "'use client'\n" +
            'export default function Page() {\n' +
            "    const cached = localStorage.getItem('user')\n" +
            '    const parsed = cached ? JSON.parse(cached) : {}\n' +
            '    return <div>{parsed.role}</div>\n' +
            '}\n',
        ({ status, out }) => {
            assert.equal(status, 1, out)
            assert.match(out, /Роль читается из локального хранилища/)
        },
    )
})

test('чтение имени и почты правило про роль не трогает', () => {
    // Это другой дефект — заголовок пустеет при пустом хранилище, — и он
    // лечится тем же переходом на сессию. Но ломать из-за него сборку сторож
    // не должен: сторож, падающий на невинном коде, отключают.
    withFixture(
        APP_FIXTURE,
        'page.tsx',
        "'use client'\n" +
            'export default function Page() {\n' +
            "    const user = JSON.parse(localStorage.getItem('user') || '{}')\n" +
            '    return <div>{user.name || user.email}</div>\n' +
            '}\n',
        ({ status, out }) => {
            assert.equal(status, 0, out)
        },
    )
})

// --- Придуманная норма КБЖУ ---------------------------------------------------
//
// `calcTargets?.calories || 2000` — валидный TypeScript, и именно так человеку с
// незаполненным профилем показывали 2000 ккал и 150 г белка как его личную
// норму. На проде такую норму видели 16 клиентов из 18.

test('запасное число на месте нормы ломает сборку и называет место', () => {
    withFixture(
        TRACKER_FIXTURE,
        'goals.ts',
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
        TRACKER_FIXTURE,
        'goals.ts',
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
        TRACKER_FIXTURE,
        'goals.ts',
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
        TRACKER_FIXTURE,
        'goals.ts',
        '// Раньше здесь стояло `calcTargets?.calories || 2000`, и это показывалось\n' +
            '// человеку как его норма.\n' +
            '/* То же и блочным комментарием: proteinGoal ?? 150 */\n' +
            'export const nothing = 1\n',
        ({ status, out }) => {
            assert.equal(status, 0, out)
        },
    )
})
