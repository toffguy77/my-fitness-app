// ios-ci: задача `ios` живёт в своём файле, запускается фильтром путей и не
// трогает имена обязательных проверок в ci.yml (CLAUDE.md, «Required Checks»).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const ci = read('.github/workflows/ci.yml')
const ios = read('.github/workflows/ios.yml')

/** Значения `paths:` из блока события (`push:` или `pull_request:`). */
function paths(workflow, event) {
    const block = workflow.split('\n')
    const start = block.findIndex((line) => line.trim() === `${event}:`)
    assert.notEqual(start, -1, `нет события ${event}`)
    const line = block.slice(start + 1).find((l) => l.trim().startsWith('paths:'))
    return [...line.matchAll(/'([^']+)'/g)].map((m) => m[1])
}

/** Простейшее сопоставление glob с `**` и `*`, как у GitHub. */
function matches(glob, file) {
    const pattern = glob
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '\u0000')
        .replace(/\*/g, '[^/]*')
        .replace(/\u0000/g, '.*')
    return new RegExp(`^${pattern}$`).test(file)
}

const triggers = (event, files) => files.some((file) => paths(ios, event).some((glob) => matches(glob, file)))

test('обязательные проверки по-прежнему существуют в ci.yml', () => {
    for (const name of ['CI Pipeline', 'Performance Analysis', 'Comprehensive Security Scan', 'Container Security Scan']) {
        assert.match(ci, new RegExp(`name: ${name}\\n`), name)
    }
})

test('задача ios — в ios.yml, а не в ci.yml', () => {
    assert.match(ios, /\n {2}ios:\n {4}name: ios\n/)
    assert.doesNotMatch(ci, /\n {2}ios:\n/)
})

test('изменение токенов запускает задачу ios', () => {
    for (const event of ['push', 'pull_request']) {
        assert.ok(triggers(event, ['packages/design-tokens/tokens/semantic/light.json']), event)
        assert.ok(triggers(event, ['apps/ios/VzveshenoKit/Sources/API/APIClient.swift']), event)
    }
})

test('изменение только веба задачу ios не запускает', () => {
    for (const event of ['push', 'pull_request']) {
        assert.ok(!triggers(event, ['apps/web/src/app/page.tsx', 'apps/api/cmd/server/main.go']), event)
    }
})

test('задача ios генерирует проект, проверяет линтер и тесты схемы Vzvesheno-Dev', () => {
    assert.match(ios, /xcodegen generate/)
    assert.match(ios, /swiftlint lint --strict/)
    assert.match(ios, /-scheme Vzvesheno-Dev/)
    assert.match(ios, /__Snapshots__/)
    assert.match(ios, /xcresult/)
})
