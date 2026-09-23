/**
 * `check-dead-handlers.mjs` появился из двух настоящих находок: кнопки
 * «Отправить недельный отчёт» и стрелки «подробнее» на задаче. Обе были на
 * виду, обе вызывали обработчик с комментарием вместо кода, обе молчали в
 * ответ на нажатие.
 *
 * Тесты запускают сам скрипт подпроцессом против игрушечных репозиториев.
 *
 * Запуск: node --test scripts/__tests__/check-dead-handlers.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'check-dead-handlers.mjs')

function runAgainst(source) {
    const root = mkdtempSync(join(tmpdir(), 'dead-handlers-'))
    try {
        mkdirSync(join(root, 'apps/web/src'), { recursive: true })
        writeFileSync(join(root, 'apps/web/src/Component.tsx'), source)
        const result = spawnSync(process.execPath, [SCRIPT], {
            encoding: 'utf8',
            env: { ...process.env, CHECK_ROOT: root },
        })
        return { status: result.status, out: result.stdout + result.stderr }
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
}

test('обработчик с телом проходит', () => {
    const { status, out } = runAgainst(
        'const handleSave = async () => {\n    await api.save()\n}\n',
    )
    assert.equal(status, 0, out)
})

test('тот самый отчёт: комментарий и вывод в консоль — не действие', () => {
    const { status, out } = runAgainst(
        "const handleSubmitReport = async () => {\n" +
            "    // TODO: Implement weekly report submission\n" +
            "    console.log('Submit weekly report')\n}\n",
    )
    assert.equal(status, 1)
    assert.match(out, /handleSubmitReport/)
})

test('та самая стрелка: пустое тело в useCallback', () => {
    const { status, out } = runAgainst(
        'const handleViewDetails = useCallback((taskId: string) => {\n' +
            '    // TODO: Navigate to task details page or open modal\n' +
            '}, [])\n',
    )
    assert.equal(status, 1)
    assert.match(out, /handleViewDetails/)
})

test('называются файл и строка, а не только имя', () => {
    const { out } = runAgainst('const x = 1\n\nconst handleDead = () => {\n    // ничего\n}\n')
    assert.match(out, /Component\.tsx:3/)
})

test('вложенные скобки в теле не сбивают разбор', () => {
    const { status, out } = runAgainst(
        'const handleOk = () => {\n    if (a) { doThing() }\n}\n',
    )
    assert.equal(status, 0, out)
})

test('дерево без обработчиков роняет проверку, а не проходит молча', () => {
    const { status, out } = runAgainst('export const value = 42\n')
    assert.equal(status, 1)
    assert.match(out, /ни одного обработчика/)
})
