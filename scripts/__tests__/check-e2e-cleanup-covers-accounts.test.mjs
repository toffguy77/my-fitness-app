/**
 * `check-e2e-cleanup-covers-accounts.mjs` существует потому, что перечень
 * учёток прогона живёт в двух местах — в фикстуре `e2e/fixtures/test-accounts.ts`
 * и в скрипте слепка `scripts/e2e-db-snapshot.sh` — и ничто их не сверяло.
 * На момент написания слепок знал три адреса из пяти: прогон под двумя
 * остальными оставил бы их на рабочем сервере, а зачистка отчиталась бы об
 * успехе, потому что про эти учётки её никто не спрашивал.
 *
 * Тесты запускают сам скрипт подпроцессом против игрушечных «репозиториев» —
 * той же дисциплиной, что и check-internal-links.test.mjs: проходящий тест
 * доказывает поведение скрипта, а не пересказ этого поведения.
 *
 * Запуск: node --test scripts/__tests__/check-e2e-cleanup-covers-accounts.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const SCRIPT = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'check-e2e-cleanup-covers-accounts.mjs',
)

/** Собирает временный «репозиторий» из двух файлов и прогоняет по нему скрипт. */
function runAgainst({ fixture, snapshot }) {
    const root = mkdtempSync(join(tmpdir(), 'e2e-accounts-'))
    try {
        mkdirSync(join(root, 'e2e/fixtures'), { recursive: true })
        mkdirSync(join(root, 'scripts'), { recursive: true })
        writeFileSync(join(root, 'e2e/fixtures/test-accounts.ts'), fixture)
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

const twoAccounts = `
export const accounts = {
  client: createAccount('E2E_CLIENT_EMAIL', 'E2E_CLIENT_PASSWORD', 'client', '/dashboard'),
  admin: createAccount('E2E_ADMIN_EMAIL', 'E2E_ADMIN_PASSWORD', 'admin', '/admin'),
}
`

const listing = (vars) => `#!/usr/bin/env bash\n    for var in ${vars}; do\n        :\n    done\n`

test('совпадающие перечни проходят', () => {
    const { status, out } = runAgainst({
        fixture: twoAccounts,
        snapshot: listing('E2E_CLIENT_EMAIL E2E_ADMIN_EMAIL'),
    })
    assert.equal(status, 0, out)
    assert.match(out, /покрывает все учётки E2E: 2/)
})

test('учётка из фикстуры, которой нет в слепке, роняет проверку по имени', () => {
    const { status, out } = runAgainst({
        fixture: twoAccounts,
        snapshot: listing('E2E_CLIENT_EMAIL'),
    })
    assert.equal(status, 1)
    assert.match(out, /E2E_ADMIN_EMAIL/)
})

test('лишняя учётка в слепке проверку не роняет: зачистить лишнее безвредно', () => {
    const { status } = runAgainst({
        fixture: twoAccounts,
        snapshot: listing('E2E_CLIENT_EMAIL E2E_ADMIN_EMAIL E2E_LEFTOVER_EMAIL'),
    })
    assert.equal(status, 0)
})

test('имя, упомянутое в слепке лишь комментарием, за покрытие не считается', () => {
    const { status, out } = runAgainst({
        fixture: twoAccounts,
        snapshot: `#!/usr/bin/env bash\n# E2E_ADMIN_EMAIL=admin@example.com\n${listing('E2E_CLIENT_EMAIL')}`,
    })
    assert.equal(status, 1, out)
    assert.match(out, /E2E_ADMIN_EMAIL/)
})

test('фикстура без учёток роняет проверку, а не проходит молча', () => {
    const { status, out } = runAgainst({
        fixture: 'export const accounts = {}\n',
        snapshot: listing('E2E_CLIENT_EMAIL'),
    })
    assert.equal(status, 1)
    assert.match(out, /ни одной переменной/)
})

test('слепок без перечня роняет проверку: сверять стало не с чем', () => {
    const { status, out } = runAgainst({
        fixture: twoAccounts,
        snapshot: '#!/usr/bin/env bash\nACCOUNTS=()\n',
    })
    assert.equal(status, 1)
    assert.match(out, /не нашёлся перечень/)
})
