/**
 * `check-e2e-guest-emails.mjs` появился из настоящего дефекта:
 * support-widget.spec.ts оставлял контакт на `widget-e2e@example.com`. Под
 * шаблоны зачистки (`e2e-lead-%`, `widget-e2e-%`, `%@burcev.test`) этот адрес
 * не подходит — не хватает дефиса, — и оставленная им заявка вместе с
 * привязанным веб-разговором осталась бы на рабочем сервере навсегда, пока
 * зачистка отчитывалась бы об успехе. Соседняя строка того же файла
 * отличалась одним дефисом и была покрыта.
 *
 * Тесты запускают сам скрипт подпроцессом против игрушечных репозиториев.
 *
 * Запуск: node --test scripts/__tests__/check-e2e-guest-emails.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'check-e2e-guest-emails.mjs')

const SNAPSHOT_WITH_PATTERNS =
    '#!/usr/bin/env bash\nDEFAULT_GUEST_PATTERNS="e2e-lead-%,widget-e2e-%,%@burcev.test"\n'

function runAgainst({ spec, snapshot = SNAPSHOT_WITH_PATTERNS }) {
    const root = mkdtempSync(join(tmpdir(), 'guest-emails-'))
    try {
        mkdirSync(join(root, 'e2e/tests'), { recursive: true })
        mkdirSync(join(root, 'scripts'), { recursive: true })
        writeFileSync(join(root, 'e2e/tests/probe.spec.ts'), spec)
        writeFileSync(join(root, 'scripts/e2e-db-snapshot.sh'), snapshot)
        const result = spawnSync(process.execPath, [SCRIPT], {
            encoding: 'utf8',
            env: { ...process.env, CHECK_ROOT: root },
        })
        return { status: result.status, out: result.stdout + result.stderr }
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
}

test('адрес на тестовом домене проходит', () => {
    const { status, out } = runAgainst({ spec: "const a = 'guest@burcev.test'\n" })
    assert.equal(status, 0, out)
})

test('интерполяция в адресе не мешает совпасть с шаблоном', () => {
    const { status, out } = runAgainst({
        spec: 'const a = `widget-e2e-${Date.now()}@example.com`\n',
    })
    assert.equal(status, 0, out)
})

test('тот самый дефект: widget-e2e без дефиса не покрыт и роняет проверку', () => {
    const { status, out } = runAgainst({ spec: "const a = 'widget-e2e@example.com'\n" })
    assert.equal(status, 1)
    assert.match(out, /widget-e2e@example\.com/)
})

test('посторонний адрес роняет проверку', () => {
    const { status, out } = runAgainst({ spec: "const a = 'someone@example.com'\n" })
    assert.equal(status, 1)
    assert.match(out, /someone@example\.com/)
})

test('названный в ALLOWED адрес проходит', () => {
    const { status, out } = runAgainst({ spec: "const a = 'wrong@example.com'\n" })
    assert.equal(status, 0, out)
})

test('адрес в комментарии не считается', () => {
    const { status, out } = runAgainst({
        spec: "// пример: someone@example.com\nconst a = 'guest@burcev.test'\n",
    })
    assert.equal(status, 0, out)
})

test('каталог без единого адреса роняет проверку, а не проходит молча', () => {
    const { status, out } = runAgainst({ spec: 'const a = 1\n' })
    assert.equal(status, 1)
    assert.match(out, /ни одного адреса/)
})

test('слепок без шаблонов роняет проверку: сверять стало не с чем', () => {
    const { status, out } = runAgainst({
        spec: "const a = 'guest@burcev.test'\n",
        snapshot: '#!/usr/bin/env bash\n',
    })
    assert.equal(status, 1)
    assert.match(out, /не нашлись шаблоны/)
})
