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
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
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
function runAgainst({ goldenLines, sourceFile, sourceText }) {
    const root = mkdtempSync(join(tmpdir(), 'api-contract-'))
    try {
        const goldenDir = join(root, 'apps/api/internal/router/testdata')
        mkdirSync(goldenDir, { recursive: true })
        writeFileSync(join(goldenDir, 'routes.golden'), goldenLines.join('\n') + '\n')

        const target = join(root, 'apps/web/src', sourceFile)
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, sourceText)

        const result = spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: 'utf8' })
        return result
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
}

const GOLDEN = ['GET /api/v1/admin/leads', 'GET /api/v1/admin/users']

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
