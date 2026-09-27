/**
 * Правило против чтения роли из локального слепка.
 *
 * Дефект нашёл пользователь, а не сборка: `/profile` и `/settings/*` выбирали
 * оболочку по `localStorage['user']` с запасным значением `'client'`, и куратор
 * при пустом или устаревшем слепке получал клиентскую навигацию.
 *
 * Проверка запускает настоящий скрипт против настоящего репозитория, подкладывая
 * на время один файл-образец: правило должно сработать на нём и не срабатывать
 * на том, что в репозитории уже лежит. Игрушечного каталога здесь не хватит —
 * скрипт читает `docker-compose.yml` и конфиг сервера, которых в нём нет.
 *
 * Запуск: node --test scripts/__tests__/check-codebase-integrity-role.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRIPT = join(REPO, 'scripts', 'check-codebase-integrity.mjs')
const FIXTURE_DIR = join(REPO, 'apps/web/src/app/__integrity_fixture__')
const FIXTURE = join(FIXTURE_DIR, 'page.tsx')

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

test('новое чтение роли из хранилища ломает сборку и называет место', () => {
    withFixture(
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

test('чтение имени и почты правило не трогает', () => {
    // Это другой дефект — заголовок пустеет при пустом хранилище, — и он
    // лечится тем же переходом на сессию. Но ломать из-за него сборку сторож
    // не должен: сторож, падающий на невинном коде, отключают.
    withFixture(
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
