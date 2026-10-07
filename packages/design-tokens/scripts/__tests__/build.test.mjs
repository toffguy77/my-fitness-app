// Сборка токенов: что она выпускает и от чего отказывается.
//
// Каждый сценарий отказа — дефект, который иначе доехал бы до экрана: роль,
// забытая в тёмной теме; ссылка на удалённый цвет; текст, который не читается
// на своём фоне; dist/, отставший от источника. Сборка идёт в копии пакета во
// временной папке — настоящий dist/ не трогается.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const script = join(pkg, 'scripts', 'build.mjs')

function sandbox(t) {
    const dir = mkdtempSync(join(tmpdir(), 'tokens-'))
    cpSync(join(pkg, 'tokens'), join(dir, 'tokens'), { recursive: true })
    cpSync(join(pkg, 'dist'), join(dir, 'dist'), { recursive: true })
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    return dir
}

function run(dir, ...args) {
    return spawnSync(process.execPath, [script, ...args], {
        env: { ...process.env, DESIGN_TOKENS_ROOT: dir },
        encoding: 'utf8',
    })
}

function edit(dir, file, change) {
    const path = join(dir, 'tokens', file)
    const json = JSON.parse(readFileSync(path, 'utf8'))
    change(json)
    writeFileSync(path, JSON.stringify(json, null, 2))
}

test('настоящий источник собран: dist/ совпадает, проверки проходят', () => {
    const result = spawnSync(process.execPath, [script, '--check'], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /Токены в порядке/)
})

test('сборка выпускает CSS, Tailwind, JS с типами и JSON', async (t) => {
    const dir = sandbox(t)
    rmSync(join(dir, 'dist'), { recursive: true })
    const result = run(dir)
    assert.equal(result.status, 0, result.stderr)

    const css = readFileSync(join(dir, 'dist/tokens.css'), 'utf8')
    assert.match(css, /:root\s*\{/)
    assert.match(css, /@media \(prefers-color-scheme: dark\)/)
    assert.match(css, /:root\[data-theme="dark"\]/)
    assert.match(css, /color-scheme: dark/)

    // Каждая роль светлой темы переопределена и в тёмной.
    const light = css.slice(0, css.indexOf('@media'))
    const dark = css.slice(css.indexOf(':root[data-theme="dark"]'))
    const roles = (block) => new Set([...block.matchAll(/(--ds-color-[\w-]+):/g)].map((m) => m[1]))
    assert.deepEqual([...roles(dark)].sort(), [...roles(light)].sort())

    const tailwind = readFileSync(join(dir, 'dist/tailwind.css'), 'utf8')
    assert.match(tailwind, /--color-\*: initial/, 'палитра Tailwind отключена')
    assert.match(tailwind, /--color-primary: var\(--ds-/)
    assert.match(tailwind, /@utility type-title-1/)

    const tokens = await import(pathToFileURL(join(dir, 'dist/tokens.js')).href)
    assert.match(tokens.color.primary, /^var\(--ds-/)
    assert.match(tokens.values.light['color.bg.canvas'], /^#[0-9A-Fa-f]{6}$/)
    assert.notEqual(tokens.values.light['color.bg.canvas'], tokens.values.dark['color.bg.canvas'])

    const dts = readFileSync(join(dir, 'dist/tokens.d.ts'), 'utf8')
    assert.match(dts, /export declare const color/)

    const json = JSON.parse(readFileSync(join(dir, 'dist/tokens.json'), 'utf8'))
    assert.ok(json.light && json.dark, 'мобильным платформам нужны обе темы')
})

test('роль, забытая в тёмной теме, останавливает сборку', (t) => {
    const dir = sandbox(t)
    edit(dir, 'semantic/dark.json', (json) => { delete json.color.fg.subtle })
    const result = run(dir)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /роль color\.fg\.subtle есть в светлой теме и нет в тёмной/)
})

test('ссылка на несуществующий цвет останавливает сборку', (t) => {
    const dir = sandbox(t)
    edit(dir, 'semantic/light.json', (json) => { json.color.fg.muted.$value = '{sand.9999}' })
    const result = run(dir)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /ссылка на несуществующий токен \{sand\.9999\}/)
})

test('цикл ссылок останавливает сборку, а не вешает её', (t) => {
    const dir = sandbox(t)
    edit(dir, 'semantic/light.json', (json) => {
        json.color.fg.muted.$value = '{color.fg.subtle}'
        json.color.fg.subtle.$value = '{color.fg.muted}'
    })
    const result = run(dir)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /цикл ссылок/)
})

test('нечитаемый текст останавливает сборку и называет пару', (t) => {
    const dir = sandbox(t)
    edit(dir, 'semantic/dark.json', (json) => { json.color.fg.muted.$value = json.color.bg.canvas.$value })
    const result = run(dir)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /контраст dark: color\.fg\.muted на color\.bg\.canvas = 1\.00 < 4\.5/)
})

test('--check ловит dist/, отставший от источника', (t) => {
    const dir = sandbox(t)
    writeFileSync(join(dir, 'dist/tokens.css'), '/* устарело */')
    const result = run(dir, '--check')
    assert.equal(result.status, 1)
    assert.match(result.stderr, /dist\/ отстал от tokens\/: dist\/tokens\.css/)
})
