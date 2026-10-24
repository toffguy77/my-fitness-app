// Сборка токенов: что она выпускает и от чего отказывается.
//
// Каждый сценарий отказа — дефект, который иначе доехал бы до экрана: роль,
// забытая в тёмной теме; ссылка на удалённый цвет; текст, который не читается
// на своём фоне; dist/, отставший от источника. Сборка идёт в копии пакета во
// временной папке — настоящий dist/ не трогается.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
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

test('полупрозрачная подложка проверяется смешанной с фоном экрана, а не без альфы', (t) => {
    const dir = sandbox(t)
    // Прежние значения #276: смешанная с canvas подложка давала 4.05 —
    // «почти проходит» в аудите iOS, а без альфы пару бы и не заметили.
    edit(dir, 'primitive/color.json', (json) => { json.palette.terracotta['500'].$value = '#B8492F' })
    edit(dir, 'semantic/light.json', (json) => { json.color.primary.soft.$value = '#B8492F1A' })
    const result = run(dir)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /контраст light: color\.primary\.default на color\.primary\.soft поверх color\.bg\.canvas = 4\.05 < 4\.5/)
    assert.match(result.stderr, /color\.primary\.soft поверх color\.bg\.surface = 4\.43 < 4\.5/)
})

test('пары #276 под проверкой: метка на вторичной заливке и подпись на info-soft', (t) => {
    const dir = sandbox(t)
    edit(dir, 'primitive/color.json', (json) => { json.palette.umber['400'].$value = '#76695A' })
    edit(dir, 'semantic/light.json', (json) => { json.color.status['info-fg'].$value = '{palette.blue.600}' })
    const result = run(dir)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /контраст light: color\.fg\.subtle на color\.bg\.subtle = 4\.34 < 4\.5/)
    assert.match(result.stderr, /color\.status\.info-fg на color\.status\.info-soft поверх color\.bg\.canvas = 4\.33 < 4\.5/)
})

test('--check ловит dist/, отставший от источника', (t) => {
    const dir = sandbox(t)
    writeFileSync(join(dir, 'dist/tokens.css'), '/* устарело */')
    const result = run(dir, '--check')
    assert.equal(result.status, 1)
    assert.match(result.stderr, /dist\/ отстал от tokens\/: dist\/tokens\.css/)
})

// ---------------------------------------------------------------------------
// iOS: Colors.xcassets и Tokens.swift
// ---------------------------------------------------------------------------

const colorset = (dir, name) =>
    JSON.parse(readFileSync(join(dir, `dist/ios/Colors.xcassets/${name}.colorset/Contents.json`), 'utf8'))

/** Компоненты варианта (Any — без appearances, Dark — luminosity: dark) обратно в #RRGGBB[AA]. */
function variantHex(set, appearance) {
    const entry = set.colors.find((c) => (appearance === 'any'
        ? !c.appearances
        : c.appearances?.some((a) => a.appearance === 'luminosity' && a.value === appearance)))
    assert.ok(entry, `нет варианта ${appearance}`)
    assert.equal(entry.color['color-space'], 'srgb')
    const { red, green, blue, alpha } = entry.color.components
    const a = Math.round(Number(alpha) * 255)
    return '#' + [red, green, blue].map((c) => c.replace(/^0x/, '')).join('') + (a === 255 ? '' : a.toString(16).toUpperCase().padStart(2, '0'))
}

test('роль в обеих темах: BgCanvas — светлое значение для Any, тёмное для Dark', (t) => {
    const dir = sandbox(t)
    rmSync(join(dir, 'dist'), { recursive: true })
    assert.equal(run(dir).status, 0)

    const json = JSON.parse(readFileSync(join(dir, 'dist/tokens.json'), 'utf8'))
    const set = colorset(dir, 'BgCanvas')
    assert.equal(variantHex(set, 'any'), json.light['color.bg.canvas'].toUpperCase())
    assert.equal(variantHex(set, 'dark'), json.dark['color.bg.canvas'].toUpperCase())

    // Полупрозрачная роль сохраняет альфу, а не теряет её.
    assert.equal(variantHex(colorset(dir, 'BgNav'), 'any'), json.light['color.bg.nav'].toUpperCase())

    // Каталог — на каждую роль, без пропусков.
    for (const key of Object.keys(json.light).filter((k) => k.startsWith('color.'))) {
        const name = key.replace(/^color\./, '').split(/[.-]/).map((w) => w[0].toUpperCase() + w.slice(1)).join('')
        const s = colorset(dir, name)
        assert.equal(variantHex(s, 'any'), json.light[key].toUpperCase(), key)
        assert.equal(variantHex(s, 'dark'), json.dark[key].toUpperCase(), key)
    }
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'dist/ios/Colors.xcassets/Contents.json'), 'utf8')), { info: { author: 'xcode', version: 1 } })
})

test('новая роль появляется в DS.Color и в каталоге под тем же именем', (t) => {
    const dir = sandbox(t)
    edit(dir, 'semantic/light.json', (json) => { json.color.bg.raised = { $value: '#FFFFFF' } })
    edit(dir, 'semantic/dark.json', (json) => { json.color.bg.raised = { $value: '#2A2420' } })
    assert.equal(run(dir).status, 0)

    const swift = readFileSync(join(dir, 'dist/ios/Tokens.swift'), 'utf8')
    assert.match(swift, /case bgRaised = "BgRaised"/)
    assert.match(swift, /static var bgRaised: SwiftUI\.Color \{ SwiftUI\.Color\("BgRaised", bundle: \.module\) \}/)
    assert.equal(variantHex(colorset(dir, 'BgRaised'), 'any'), '#FFFFFF')
    assert.equal(variantHex(colorset(dir, 'BgRaised'), 'dark'), '#2A2420')
})

test('--check называет отставший colorset, когда цвет поправлен без пересборки', (t) => {
    const dir = sandbox(t)
    edit(dir, 'semantic/dark.json', (json) => { json.color.bg.canvas.$value = '#101010' })
    const result = run(dir, '--check')
    assert.equal(result.status, 1)
    assert.match(result.stderr, /dist\/ios\/Colors\.xcassets\/BgCanvas\.colorset\/Contents\.json/)
})

test('--check ловит отставший Tokens.swift', (t) => {
    const dir = sandbox(t)
    writeFileSync(join(dir, 'dist/ios/Tokens.swift'), '// устарело\n')
    const result = run(dir, '--check')
    assert.equal(result.status, 1)
    assert.match(result.stderr, /dist\/ios\/Tokens\.swift/)
})

test('colorset удалённой роли ловится проверкой и убирается сборкой', (t) => {
    const dir = sandbox(t)
    const ghost = join(dir, 'dist/ios/Colors.xcassets/Ghost.colorset')
    cpSync(join(dir, 'dist/ios/Colors.xcassets/BgCanvas.colorset'), ghost, { recursive: true })

    const check = run(dir, '--check')
    assert.equal(check.status, 1)
    assert.match(check.stderr, /лишние файлы.*dist\/ios\/Colors\.xcassets\/Ghost\.colorset\/Contents\.json/)

    assert.equal(run(dir).status, 0)
    assert.equal(existsSync(ghost), false)
    assert.equal(run(dir, '--check').status, 0)
})

// Ключевые слова Swift: член с таким именем без обратных кавычек не скомпилируется.
const SWIFT_KEYWORDS = new Set(['associatedtype', 'class', 'deinit', 'enum', 'extension', 'fileprivate', 'func', 'import', 'init', 'inout',
    'internal', 'let', 'open', 'operator', 'private', 'protocol', 'public', 'rethrows', 'static', 'struct', 'subscript', 'typealias', 'var',
    'break', 'case', 'continue', 'default', 'defer', 'do', 'else', 'fallthrough', 'for', 'guard', 'if', 'in', 'repeat', 'return', 'switch',
    'where', 'while', 'as', 'false', 'is', 'nil', 'self', 'Self', 'super', 'throw', 'throws', 'true', 'try', 'Any', 'await'])

function declaredSwiftNames(swift) {
    return [...swift.matchAll(/(?:\bcase|static let|static var|enum|struct)\s+(`?[^\s:=({]+`?)/g)]
        .map((m) => m[1])
        .filter((n) => !n.startsWith('.')) // case .x: в switch — не объявление
}

test('имена в Tokens.swift — допустимые идентификаторы Swift', () => {
    const swift = readFileSync(join(pkg, 'dist/ios/Tokens.swift'), 'utf8')
    const names = declaredSwiftNames(swift)
    assert.ok(names.length > 80, `найдено подозрительно мало объявлений: ${names.length}`)
    for (const name of names) {
        if (name.startsWith('`')) { assert.match(name, /^`[A-Za-z_][A-Za-z0-9_]*`$/); continue }
        assert.match(name, /^[A-Za-z_][A-Za-z0-9_]*$/, `недопустимое имя ${name}`)
        assert.ok(!SWIFT_KEYWORDS.has(name), `ключевое слово без кавычек: ${name}`)
    }
    // Шкала отступов начинается с цифры — в Swift она получает приставку.
    assert.match(swift, /public static let s4: CGFloat = 16/)
    assert.match(swift, /public static let screenX: CGFloat = 20/)
})

test('роль с именем ключевого слова экранируется, а не ломает компиляцию', (t) => {
    const dir = sandbox(t)
    edit(dir, 'semantic/light.json', (json) => { json.color.return = { $value: '#FFFFFF' } })
    edit(dir, 'semantic/dark.json', (json) => { json.color.return = { $value: '#000000' } })
    assert.equal(run(dir).status, 0)
    const swift = readFileSync(join(dir, 'dist/ios/Tokens.swift'), 'utf8')
    assert.match(swift, /case `return` = "Return"/)
    for (const name of declaredSwiftNames(swift)) assert.ok(!SWIFT_KEYWORDS.has(name), `ключевое слово без кавычек: ${name}`)
})

test('стили текста получают относительный стиль Dynamic Type', () => {
    const swift = readFileSync(join(pkg, 'dist/ios/Tokens.swift'), 'utf8')
    assert.match(swift, /static let title1 = TextStyle\(family: FontFamily\.serif, size: 30, .*relativeTo: \.title,/)
    assert.match(swift, /static let body = TextStyle\(family: FontFamily\.sans, size: 16, .*relativeTo: \.body,/)
    assert.match(swift, /static let numXl = TextStyle\(.*relativeTo: \.largeTitle, monospacedDigits: true/)
    assert.match(swift, /public static let serif = "Literata"/)
    assert.match(swift, /public static let sans = "Golos Text"/)
    // Цвета и шрифты — только там, где есть SwiftUI: остальное собирается и без него.
    const ui = swift.indexOf('#if canImport(SwiftUI)\nextension DS')
    assert.ok(ui > 0)
    assert.equal(swift.slice(0, ui).includes('SwiftUI.'), false, 'SwiftUI вне #if canImport(SwiftUI)')
})

test('стиль текста без относительного стиля Dynamic Type останавливает сборку', (t) => {
    const dir = sandbox(t)
    edit(dir, 'base.json', (json) => { json.type.huge = structuredClone(json.type.display) })
    const result = run(dir)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /type\.huge нет относительного стиля Dynamic Type/)
})
