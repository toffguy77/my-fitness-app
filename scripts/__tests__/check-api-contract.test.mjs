/**
 * `check-api-contract.mjs` exists to catch a frontend call to an API path the
 * backend never registered. It missed a whole shape of call site: a path
 * built from a module-local constant —
 *
 *   const BASE = '/api/v1/admin'
 *   apiClient.get(`${BASE}/leads`)
 *
 * — because its scanning regex requires the string literal to *start* with
 * `/api/`, and a template literal opening with `${BASE}` does not. Fifty-one
 * call sites across seven files were invisible to the check for this reason,
 * including the entire admin and curator API surfaces.
 *
 * These tests run the script itself, as a subprocess, against small fixture
 * repos — never a hand-authored fixture in the same file as the assertion,
 * so a passing test proves the script's actual matching, not a paraphrase of
 * it. Each case builds a throwaway "repo" (routes.golden + a web source
 * file), runs the real script against it, and reads the real exit code and
 * output.
 *
 * Run: node --test scripts/__tests__/check-api-contract.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'check-api-contract.mjs')

/**
 * Builds a throwaway repo under a temp dir: a golden route table plus one
 * web source file, then runs the real script against it with that dir as
 * cwd (the script reads `apps/api/.../routes.golden` and walks `apps/web/src`
 * relative to `process.cwd()`).
 */
function runAgainst({ goldenLines, sourceFile, sourceText, registryEntries, extraFiles = {} }) {
    const root = mkdtempSync(join(tmpdir(), 'api-contract-'))
    try {
        const goldenDir = join(root, 'apps/api/internal/router/testdata')
        mkdirSync(goldenDir, { recursive: true })
        writeFileSync(join(goldenDir, 'routes.golden'), goldenLines.join('\n') + '\n')

        const target = join(root, 'apps/web/src', sourceFile)
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, sourceText)

        // Реестр маршрутов без вызова. Отсутствие файла — пустой реестр, и это
        // тоже проверяемое состояние.
        if (registryEntries !== undefined) {
            const registry = join(root, 'scripts/uncalled-routes.json')
            mkdirSync(dirname(registry), { recursive: true })
            writeFileSync(registry, JSON.stringify(registryEntries, null, 2))
        }

        for (const [path, text] of Object.entries(extraFiles)) {
            const file = join(root, path)
            mkdirSync(dirname(file), { recursive: true })
            writeFileSync(file, text)
        }

        const result = spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: 'utf8' })
        return result
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
}

// Один маршрут, и его зовут все случаи ниже. Второго здесь больше нет: с тех
// пор как проверка смотрит и в обратную сторону, маршрут, которого фикстура не
// зовёт, честно ломает её — именно за этим обратная сторона и заведена.
const GOLDEN = ['GET /api/v1/admin/leads']

test('a path built from a local BASE constant is detected when missing', () => {
    const result = runAgainst({
        goldenLines: GOLDEN,
        sourceFile: 'features/admin/api/adminApi.ts',
        sourceText: [
            "const BASE = '/api/v1/admin'",
            'export const adminApi = {',
            '    getGhost: () => apiClient.get(`${BASE}/does-not-exist`),',
            '}',
            '',
        ].join('\n'),
    })
    assert.equal(result.status, 1, `expected the script to fail:\n${result.stdout}${result.stderr}`)
    assert.match(result.stderr, /\/api\/v1\/admin\/does-not-exist/)
})

test('a path built from a local BASE constant is not flagged when it exists', () => {
    const result = runAgainst({
        goldenLines: GOLDEN,
        sourceFile: 'features/admin/api/adminApi.ts',
        sourceText: [
            "const BASE = '/api/v1/admin'",
            'export const adminApi = {',
            '    getLeads: () => apiClient.get(`${BASE}/leads`),',
            '}',
            '',
        ].join('\n'),
    })
    assert.equal(result.status, 0, `expected the script to pass:\n${result.stdout}${result.stderr}`)
    assert.match(result.stdout, /API contract OK/)
})

test('a plain /api/... literal is still detected when missing', () => {
    const result = runAgainst({
        goldenLines: GOLDEN,
        sourceFile: 'features/admin/api/plainApi.ts',
        sourceText: "apiClient.get('/api/v1/admin/does-not-exist')\n",
    })
    assert.equal(result.status, 1, `expected the script to fail:\n${result.stdout}${result.stderr}`)
    assert.match(result.stderr, /\/api\/v1\/admin\/does-not-exist/)
})

test('a plain /api/... literal is still not flagged when it exists', () => {
    const result = runAgainst({
        goldenLines: GOLDEN,
        sourceFile: 'features/admin/api/plainApi.ts',
        sourceText: "apiClient.get('/api/v1/admin/leads')\n",
    })
    assert.equal(result.status, 0, `expected the script to pass:\n${result.stdout}${result.stderr}`)
    assert.match(result.stdout, /API contract OK/)
})

test('an API_BASE that falls back to an empty string does not create a false alarm', () => {
    const result = runAgainst({
        goldenLines: GOLDEN,
        sourceFile: 'features/auth/api/auth.ts',
        sourceText: [
            "const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';",
            'export const authApi = {',
            '    getLeads: () => apiClient.get(`${API_BASE}/api/v1/admin/leads`),',
            '}',
            '',
        ].join('\n'),
    })
    assert.equal(result.status, 0, `expected the script to pass:\n${result.stdout}${result.stderr}`)
    assert.match(result.stdout, /API contract OK/)
})

/**
 * A nested template literal inside an interpolation used to end the outer
 * literal as far as the scan was concerned, and the path vanished. Found in
 * the wild: `getSupportConversations` built its query this way, so it went
 * unchecked while its three siblings in the same file were checked — the one
 * call able to drift unnoticed was the one nobody could see.
 */
test('a path whose query is built with a nested template literal is detected when missing', () => {
    const result = runAgainst({
        goldenLines: GOLDEN,
        sourceFile: 'features/admin/api/adminApi.ts',
        sourceText: [
            "const BASE = '/api/v1/admin'",
            'export const adminApi = {',
            '    list: (status, page) => {',
            '        const query = pageQuery(page)',
            "        const separator = query ? '&' : '?'",
            '        return apiClient.get(',
            "            `${BASE}/does-not-exist${query}${status ? `${separator}status=${status}` : ''}`",
            '        )',
            '    },',
            '}',
            '',
        ].join('\n'),
    })
    assert.equal(result.status, 1, `expected the script to fail:\n${result.stdout}${result.stderr}`)
    assert.match(result.stderr, /\/api\/v1\/admin\/does-not-exist/)
})

test('a nested-template path that exists is not flagged', () => {
    const result = runAgainst({
        goldenLines: GOLDEN,
        sourceFile: 'features/admin/api/adminApi.ts',
        sourceText: [
            "const BASE = '/api/v1/admin'",
            'export const adminApi = {',
            '    list: (status, page) => {',
            '        const query = pageQuery(page)',
            "        const separator = query ? '&' : '?'",
            '        return apiClient.get(',
            "            `${BASE}/leads${query}${status ? `${separator}status=${status}` : ''}`",
            '        )',
            '    },',
            '}',
            '',
        ].join('\n'),
    })
    assert.equal(result.status, 0, `expected the script to pass:\n${result.stdout}${result.stderr}`)
})

// ============================================================================
// Пути, которых скан раньше не видел
// ============================================================================
//
// Для прямой проверки невидимый путь — пропущенная проверка. Для обратной — ложное
// обвинение: маршрут называется невызываемым, хотя его зовут. Второе хуже, потому
// что проверку, которая врёт, начинают обходить. Наивный разбор давал 42
// «невызываемых» маршрута из 164; настоящих среди них оказалось 10.

const API_CONFIG = "export const API_CONFIG = { baseUrl: '', version: '/api/v1' } as const\n"

test('a path written without the version prefix is resolved through getApiUrl', () => {
    const result = runAgainst({
        goldenLines: ['GET /api/v1/food-tracker/entries'],
        sourceFile: 'features/food-tracker/store/entriesSlice.ts',
        sourceText: "const url = getApiUrl('/food-tracker/entries')\n",
        extraFiles: { 'apps/web/src/config/api.ts': API_CONFIG },
    })
    assert.equal(result.status, 0, `expected the script to pass:\n${result.stdout}${result.stderr}`)
})

test('a getApiUrl path that does not exist is still caught', () => {
    const result = runAgainst({
        goldenLines: ['GET /api/v1/food-tracker/entries'],
        sourceFile: 'features/food-tracker/store/entriesSlice.ts',
        sourceText: [
            "const url = getApiUrl('/food-tracker/entries')",
            "const ghost = getApiUrl('/food-tracker/does-not-exist')",
            '',
        ].join('\n'),
        extraFiles: { 'apps/web/src/config/api.ts': API_CONFIG },
    })
    assert.equal(result.status, 1, `expected the script to fail:\n${result.stdout}${result.stderr}`)
    assert.match(result.stderr, /\/api\/v1\/food-tracker\/does-not-exist/)
})

test('a path glued together with + is resolved', () => {
    const result = runAgainst({
        goldenLines: ['POST /api/v1/dashboard/tasks/:id/complete'],
        sourceFile: 'features/dashboard/api/dashboardApi.ts',
        sourceText: "apiClient.post(getApiUrl('/dashboard/tasks/' + taskId + '/complete'), {})\n",
        extraFiles: { 'apps/web/src/config/api.ts': API_CONFIG },
    })
    assert.equal(result.status, 0, `expected the script to pass:\n${result.stdout}${result.stderr}`)
})

test('a trailing + concatenation is resolved', () => {
    const result = runAgainst({
        goldenLines: ['GET /api/v1/dashboard/tasks/:id'],
        sourceFile: 'features/dashboard/api/dashboardApi.ts',
        sourceText: "apiClient.get(getApiUrl('/dashboard/tasks/' + taskId))\n",
        extraFiles: { 'apps/web/src/config/api.ts': API_CONFIG },
    })
    assert.equal(result.status, 0, `expected the script to pass:\n${result.stdout}${result.stderr}`)
})

// `clients/${id}?days=${n}`: параметр последний в пути, за ним `?`, а не слэш.
// Подстановка до обрезки запроса теряла его — и маршрут выглядел невызываемым,
// пока `curatorApi.getClientDetail` его звал.
test('a parameter followed by a query string is still a path parameter', () => {
    const result = runAgainst({
        goldenLines: ['GET /api/v1/curator/clients/:id'],
        sourceFile: 'features/curator/api/curatorApi.ts',
        sourceText: [
            "const BASE = '/api/v1/curator'",
            'apiClient.get(`${BASE}/clients/${id}?days=${days ?? 7}`)',
            '',
        ].join('\n'),
    })
    assert.equal(result.status, 0, `expected the script to pass:\n${result.stdout}${result.stderr}`)
})

// ============================================================================
// Реестр маршрутов без вызова
// ============================================================================

const CALLS_LEADS = "apiClient.get('/api/v1/admin/leads')\n"

test('a route nothing calls fails the check and is named', () => {
    const result = runAgainst({
        goldenLines: ['GET /api/v1/admin/leads', 'POST /api/v1/analytics/identify'],
        sourceFile: 'features/admin/api/adminApi.ts',
        sourceText: CALLS_LEADS,
        registryEntries: [],
    })
    assert.equal(result.status, 1, `expected the script to fail:\n${result.stdout}${result.stderr}`)
    assert.match(result.stderr, /POST \/api\/v1\/analytics\/identify/)
})

test('a route declared in the registry is allowed', () => {
    const result = runAgainst({
        goldenLines: ['GET /api/v1/admin/leads', 'POST /api/v1/public/support/telegram'],
        sourceFile: 'features/admin/api/adminApi.ts',
        sourceText: CALLS_LEADS,
        registryEntries: [
            { route: 'POST /api/v1/public/support/telegram', reason: 'Вебхук Telegram.' },
        ],
    })
    assert.equal(result.status, 0, `expected the script to pass:\n${result.stdout}${result.stderr}`)
})

test('a missing registry file is an empty registry, not an excuse', () => {
    const result = runAgainst({
        goldenLines: ['GET /api/v1/admin/leads', 'GET /health'],
        sourceFile: 'features/admin/api/adminApi.ts',
        sourceText: CALLS_LEADS,
    })
    assert.equal(result.status, 1, `expected the script to fail:\n${result.stdout}${result.stderr}`)
    assert.match(result.stderr, /GET \/health/)
})

// Причина — весь смысл реестра: через полгода спросят не «есть ли исключение», а
// «почему оно здесь».
test('a registry entry without a reason fails the check', () => {
    const result = runAgainst({
        goldenLines: ['GET /api/v1/admin/leads', 'GET /health'],
        sourceFile: 'features/admin/api/adminApi.ts',
        sourceText: CALLS_LEADS,
        registryEntries: [{ route: 'GET /health' }],
    })
    assert.equal(result.status, 1, `expected the script to fail:\n${result.stdout}${result.stderr}`)
    assert.match(result.stderr, /needs a route and a reason/)
})

test('a registry entry with an empty reason fails the check', () => {
    const result = runAgainst({
        goldenLines: ['GET /api/v1/admin/leads', 'GET /health'],
        sourceFile: 'features/admin/api/adminApi.ts',
        sourceText: CALLS_LEADS,
        registryEntries: [{ route: 'GET /health', reason: '   ' }],
    })
    assert.equal(result.status, 1, `expected the script to fail:\n${result.stdout}${result.stderr}`)
    assert.match(result.stderr, /needs a route and a reason/)
})

// Запись, которую перестали заслуживать, обесценивает остальные.
test('a registry entry for a route that is called now is reported as stale', () => {
    const result = runAgainst({
        goldenLines: ['GET /api/v1/admin/leads'],
        sourceFile: 'features/admin/api/adminApi.ts',
        sourceText: CALLS_LEADS,
        registryEntries: [{ route: 'GET /api/v1/admin/leads', reason: 'когда-то не звали' }],
    })
    assert.equal(result.status, 1, `expected the script to fail:\n${result.stdout}${result.stderr}`)
    assert.match(result.stderr, /stale/)
    assert.match(result.stderr, /GET \/api\/v1\/admin\/leads/)
})

test('a registry entry for a route the backend does not register is reported', () => {
    const result = runAgainst({
        goldenLines: ['GET /api/v1/admin/leads'],
        sourceFile: 'features/admin/api/adminApi.ts',
        sourceText: CALLS_LEADS,
        registryEntries: [{ route: 'GET /api/v1/gone', reason: 'маршрут снят, запись осталась' }],
    })
    assert.equal(result.status, 1, `expected the script to fail:\n${result.stdout}${result.stderr}`)
    assert.match(result.stderr, /does not register/)
    assert.match(result.stderr, /GET \/api\/v1\/gone/)
})

// «Пока не дотянуто» — не причина, а тот самый дефект. Поэтому признанный дефект
// обязан указывать на файл, где работа записана.
test('a known defect must point at a readable file', () => {
    const result = runAgainst({
        goldenLines: ['GET /api/v1/admin/leads', 'POST /api/v1/food-tracker/favorites/:foodId'],
        sourceFile: 'features/admin/api/adminApi.ts',
        sourceText: CALLS_LEADS,
        registryEntries: [
            {
                route: 'POST /api/v1/food-tracker/favorites/:foodId',
                reason: 'кнопки нет',
                defect: 'openspec/changes/nowhere/proposal.md',
            },
        ],
    })
    assert.equal(result.status, 1, `expected the script to fail:\n${result.stdout}${result.stderr}`)
    assert.match(result.stderr, /point at work that does not exist/)
})

test('a known defect pointing at an existing file is allowed', () => {
    const result = runAgainst({
        goldenLines: ['GET /api/v1/admin/leads', 'POST /api/v1/food-tracker/favorites/:foodId'],
        sourceFile: 'features/admin/api/adminApi.ts',
        sourceText: CALLS_LEADS,
        registryEntries: [
            {
                route: 'POST /api/v1/food-tracker/favorites/:foodId',
                reason: 'кнопки нет',
                defect: 'openspec/changes/server-only-features/proposal.md',
            },
        ],
        extraFiles: {
            'openspec/changes/server-only-features/proposal.md': '## Why\nизбранное\n',
        },
    })
    assert.equal(result.status, 0, `expected the script to pass:\n${result.stdout}${result.stderr}`)
})

test('a defect pointing at a directory rather than a file is not enough', () => {
    const result = runAgainst({
        goldenLines: ['GET /api/v1/admin/leads', 'POST /api/v1/food-tracker/favorites/:foodId'],
        sourceFile: 'features/admin/api/adminApi.ts',
        sourceText: CALLS_LEADS,
        registryEntries: [
            {
                route: 'POST /api/v1/food-tracker/favorites/:foodId',
                reason: 'кнопки нет',
                defect: 'openspec/changes/server-only-features',
            },
        ],
        extraFiles: {
            'openspec/changes/server-only-features/proposal.md': '## Why\nизбранное\n',
        },
    })
    assert.equal(result.status, 1, `expected the script to fail:\n${result.stdout}${result.stderr}`)
    assert.match(result.stderr, /point at work that does not exist/)
})

// ============================================================================
// Запуск
// ============================================================================

// Проверка, которую CI зовёт не так, как разработчик, — две разные проверки.
test('CI runs this very script', () => {
    const ci = readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.github/workflows/ci.yml'),
        'utf8'
    )
    assert.match(ci, /node scripts\/check-api-contract\.mjs/)
})
