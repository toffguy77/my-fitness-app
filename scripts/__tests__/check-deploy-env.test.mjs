/**
 * `check-deploy-env.mjs` появился из настоящей находки: в примерах окружения
 * выкатки лежали двенадцать настроек, не доходивших до кода вообще — включая
 * `CORS_ORIGIN`, обещавший ограничение источников запросов, и
 * `NEXT_PUBLIC_OPENROUTER_API_KEY`, секрет с публичной приставкой. Ни одна не
 * читалась ничем: `docker-compose.yml` перечисляет переменные поимённо, и не
 * названная там внутрь контейнера не попадает.
 *
 * Настройка, которую можно задать и которая ничего не делает, хуже её
 * отсутствия: она выглядит рабочей.
 *
 * Запуск: node --test scripts/__tests__/check-deploy-env.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'check-deploy-env.mjs')

function runAgainst({ compose, envFiles }) {
    const root = mkdtempSync(join(tmpdir(), 'deploy-env-'))
    try {
        mkdirSync(join(root, 'deploy/env'), { recursive: true })
        writeFileSync(join(root, 'docker-compose.yml'), compose)
        for (const [name, body] of Object.entries(envFiles)) {
            writeFileSync(join(root, 'deploy/env', name), body)
        }
        const result = spawnSync(process.execPath, [SCRIPT], {
            encoding: 'utf8',
            env: { ...process.env, CHECK_ROOT: root },
        })
        return { status: result.status, out: result.stdout + result.stderr }
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
}

const COMPOSE = `services:
  api:
    environment:
      - DB_HOST=\${DB_HOST}
      - SMTP_HOST=\${SMTP_HOST}
    labels:
      - "router=burcev-\${APP_ENV:-dev}"
`

test('переменная, пробрасываемая в сервис, проходит', () => {
    const { status, out } = runAgainst({
        compose: COMPOSE,
        envFiles: { '.env.prod.example': 'DB_HOST=db\nSMTP_HOST=mail\n' },
    })
    assert.equal(status, 0, out)
    assert.match(out, /проверено 2/)
})

test('переменная, подставляемая самим составом, тоже проходит', () => {
    // APP_ENV не пробрасывается в сервис, но состав им пользуется —
    // это работа, просто на другом уровне.
    const { status, out } = runAgainst({
        compose: COMPOSE,
        envFiles: { '.env.prod.example': 'APP_ENV=prod\n' },
    })
    assert.equal(status, 0, out)
})

test('настройка, которой нет в составе, роняет проверку по имени и строке', () => {
    const { status, out } = runAgainst({
        compose: COMPOSE,
        envFiles: { '.env.prod.example': 'DB_HOST=db\nCORS_ORIGIN=https://example.com\n' },
    })
    assert.equal(status, 1)
    assert.match(out, /CORS_ORIGIN/)
    assert.match(out, /\.env\.prod\.example:2/)
})

test('проверяются все файлы-примеры, а не первый', () => {
    const { status, out } = runAgainst({
        compose: COMPOSE,
        envFiles: {
            '.env.prod.example': 'DB_HOST=db\n',
            '.env.dev.example': 'DEBUG_MODE=true\n',
        },
    })
    assert.equal(status, 1)
    assert.match(out, /DEBUG_MODE/)
})

test('комментарий с именем переменной за объявление не считается', () => {
    const { status, out } = runAgainst({
        compose: COMPOSE,
        envFiles: { '.env.prod.example': '# CORS_ORIGIN=https://example.com\nDB_HOST=db\n' },
    })
    assert.equal(status, 0, out)
})

test('состав без переменных роняет проверку, а не проходит молча', () => {
    const { status, out } = runAgainst({
        compose: 'services:\n  api:\n    image: x\n',
        envFiles: { '.env.prod.example': 'DB_HOST=db\n' },
    })
    assert.equal(status, 1)
    assert.match(out, /не нашлось ни одной переменной/)
})

test('примеры без объявлений роняют проверку: сторожу нечего сторожить', () => {
    const { status, out } = runAgainst({
        compose: COMPOSE,
        envFiles: { '.env.prod.example': '# только комментарии\n' },
    })
    assert.equal(status, 1)
    assert.match(out, /не объявлено ни одной/)
})
