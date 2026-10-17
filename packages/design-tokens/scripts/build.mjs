#!/usr/bin/env node
/**
 * Сборка токенов BURCEV.
 *
 * Источник — JSON в формате W3C Design Tokens (DTCG) в `tokens/`. Отсюда
 * собираются все платформенные представления, и только отсюда:
 *
 *   dist/tokens.css     CSS-переменные --ds-*: светлая тема в :root, тёмная —
 *                       по prefers-color-scheme и по [data-theme="dark"]
 *   dist/tailwind.css   @theme для Tailwind v4: утилиты bg-surface, text-fg-muted,
 *                       rounded-card, type-title-2 … ссылаются на --ds-*
 *   dist/tokens.js      те же роли для кода (SVG, recharts) и сырые значения (+ .d.ts)
 *   dist/tokens.json    развёрнутые значения обеих тем — для Android и прочих потребителей
 *   dist/ios/Colors.xcassets  каталог цветов: colorset на роль (bg.canvas → BgCanvas),
 *                       варианты Any (светлая) и Dark (тёмная)
 *   dist/ios/Tokens.swift     DS.Color (из каталога), DS.Space/Radius/Size (CGFloat),
 *                       DS.Typography с относительным стилем Dynamic Type
 *
 * Сборка же и проверяет то, что иначе разъезжается молча:
 *   - ссылка {palette.x.y} указывает на существующий токен;
 *   - у светлой и тёмной темы один и тот же набор ролей;
 *   - пары «текст на фоне» держат контраст WCAG (см. CONTRAST_PAIRS).
 *
 * `node scripts/build.mjs --check` ничего не пишет и падает, если dist/ отстал
 * от источника. Его вызывает CI.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Корень пакета. Переопределяется только тестами сборки: они собирают копию
// токенов во временной папке, чтобы проверить отказы, не трогая настоящий dist/.
const root = process.env.DESIGN_TOKENS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'))

const sources = {
    palette: read('tokens/primitive/color.json'),
    base: read('tokens/base.json'),
    light: read('tokens/semantic/light.json'),
    dark: read('tokens/semantic/dark.json'),
}

// ---------------------------------------------------------------------------
// Разбор DTCG
// ---------------------------------------------------------------------------

/** Плоский список токенов: путь → { value, type, description }. */
function flatten(node, path = [], inheritedType, out = new Map()) {
    const type = node.$type ?? inheritedType
    if (Object.prototype.hasOwnProperty.call(node, '$value')) {
        out.set(path.join('.'), { value: node.$value, type, description: node.$description })
        return out
    }
    for (const [key, child] of Object.entries(node)) {
        if (key.startsWith('$')) continue
        flatten(child, [...path, key], type, out)
    }
    return out
}

const palette = flatten(sources.palette)
const base = flatten(sources.base)
const themes = { light: flatten(sources.light), dark: flatten(sources.dark) }

const errors = []

function resolve(value, scope, seen = []) {
    if (typeof value !== 'string') return value
    const ref = value.match(/^\{([^}]+)\}$/)
    if (!ref) return value
    const key = ref[1]
    if (seen.includes(key)) {
        errors.push(`цикл ссылок: ${[...seen, key].join(' → ')}`)
        return value
    }
    const target = scope.get(key)
    if (!target) {
        errors.push(`ссылка на несуществующий токен {${key}}`)
        return value
    }
    return resolve(target.value, scope, [...seen, key])
}

function resolveAll(tokens, extraScope) {
    const scope = new Map([...palette, ...base, ...(extraScope ?? []), ...tokens])
    const out = new Map()
    for (const [k, t] of tokens) out.set(k, { ...t, value: resolve(t.value, scope) })
    return out
}

const resolvedBase = resolveAll(base)
const resolved = { light: resolveAll(themes.light), dark: resolveAll(themes.dark) }

// Темы обязаны описывать одни и те же роли: роль, забытая в тёмной теме,
// молча наследует светлое значение и даёт тёмный текст на тёмном фоне.
const lightKeys = [...themes.light.keys()].sort()
const darkKeys = [...themes.dark.keys()].sort()
for (const k of lightKeys) if (!themes.dark.has(k)) errors.push(`роль ${k} есть в светлой теме и нет в тёмной`)
for (const k of darkKeys) if (!themes.light.has(k)) errors.push(`роль ${k} есть в тёмной теме и нет в светлой`)

// ---------------------------------------------------------------------------
// Контраст
// ---------------------------------------------------------------------------

/** [текст, фон, минимум]. 4.5 — обычный текст, 3 — крупный текст и значимая графика. */
const CONTRAST_PAIRS = [
    ['color.fg.default', 'color.bg.canvas', 4.5],
    ['color.fg.default', 'color.bg.surface', 4.5],
    ['color.fg.muted', 'color.bg.canvas', 4.5],
    ['color.fg.muted', 'color.bg.surface', 4.5],
    ['color.fg.subtle', 'color.bg.canvas', 4.5],
    ['color.fg.subtle', 'color.bg.surface', 4.5],
    ['color.fg.inverse', 'color.fg.default', 4.5],
    ['color.primary.fg', 'color.primary.default', 4.5],
    ['color.primary.default', 'color.bg.surface', 4.5],
    ['color.coach.fg', 'color.coach.bg', 4.5],
    ['color.coach.fg-muted', 'color.coach.bg', 4.5],
    ['color.macro.protein-fg', 'color.bg.surface', 4.5],
    ['color.macro.fat-fg', 'color.bg.surface', 4.5],
    ['color.macro.carbs-fg', 'color.bg.surface', 4.5],
    ['color.status.success-fg', 'color.bg.surface', 4.5],
    ['color.status.warning-fg', 'color.bg.surface', 4.5],
    ['color.status.danger-fg', 'color.bg.surface', 4.5],
    ['color.status.info-fg', 'color.bg.surface', 4.5],
    ['color.macro.protein', 'color.track', 3],
    ['color.macro.fat', 'color.track', 3],
    ['color.macro.carbs', 'color.track', 3],
    ['color.primary.default', 'color.track', 3],
    ['color.focus', 'color.bg.canvas', 3],
]

function luminance(hex) {
    const h = hex.replace('#', '')
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
export function contrast(a, b) {
    const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (l1 + 0.05) / (l2 + 0.05)
}

const contrastReport = []
for (const theme of ['light', 'dark']) {
    for (const [fg, bg, min] of CONTRAST_PAIRS) {
        const a = resolved[theme].get(fg)?.value
        const b = resolved[theme].get(bg)?.value
        if (!a || !b) { errors.push(`контраст: нет токена ${!a ? fg : bg} (${theme})`); continue }
        const ratio = contrast(a, b)
        contrastReport.push({ theme, fg, bg, ratio: Math.round(ratio * 100) / 100, min })
        if (ratio < min) errors.push(`контраст ${theme}: ${fg} на ${bg} = ${ratio.toFixed(2)} < ${min}`)
    }
}

if (errors.length) {
    console.error('Токены не собраны:\n  ' + errors.join('\n  '))
    process.exit(1)
}

// ---------------------------------------------------------------------------
// Имена
// ---------------------------------------------------------------------------

const cssName = (path) => `--ds-${path.replace(/\./g, '-')}`

/**
 * Имя цвета в Tailwind: bg-<имя>, text-<имя>, border-<имя>.
 * Группа «bg/status/macro» в имени не нужна, «default» — тоже;
 * текст на заливке называется on-<заливка>, как в Material.
 */
function twColorName(path) {
    const p = path.replace(/^color\./, '').split('.')
    const [group, ...rest] = p
    const leaf = rest.join('-')
    switch (group) {
        case 'bg': return leaf
        case 'fg': return leaf === 'default' ? 'fg' : `fg-${leaf}`
        case 'line': return leaf === 'default' ? 'line' : `line-${leaf}`
        case 'primary':
            if (leaf === 'default') return 'primary'
            if (leaf === 'fg') return 'on-primary'
            return `primary-${leaf}`
        case 'coach':
            if (leaf === 'bg') return 'coach'
            return leaf === 'fg' ? 'on-coach' : `on-coach-${leaf.replace(/^fg-/, '')}`
        case 'macro':
        case 'status':
            return leaf
        default:
            return [group, ...rest].join('-')
    }
}

function cssValue(t) {
    const v = t.value
    if (t.type === 'shadow') return `${v.offsetX} ${v.offsetY} ${v.blur} ${v.spread} ${v.color}`
    if (t.type === 'fontFamily') return v.map((f) => (/\s/.test(f) ? `"${f}"` : f)).join(', ')
    if (t.type === 'cubicBezier') return `cubic-bezier(${v.join(', ')})`
    return String(v)
}

// ---------------------------------------------------------------------------
// Вывод
// ---------------------------------------------------------------------------

const header = '/* Сгенерировано packages/design-tokens/scripts/build.mjs из tokens/*.json. Не править руками. */\n'

function baseDecls() {
    const lines = []
    for (const [k, t] of resolvedBase) {
        if (k.startsWith('type.') && k.endsWith('.family')) {
            lines.push(`  ${cssName(k)}: var(${cssName(`font.family.${t.value}`)});`)
            continue
        }
        lines.push(`  ${cssName(k)}: ${cssValue(t)};`)
    }
    return lines
}
const themeDecls = (theme) => [...resolved[theme]].map(([k, t]) => `  ${cssName(k)}: ${cssValue(t)};`)

const css = header + [
    ':root {',
    '  color-scheme: light;',
    ...baseDecls(),
    ...themeDecls('light'),
    '}',
    '',
    '@media (prefers-color-scheme: dark) {',
    '  :root:not([data-theme="light"]) {',
    '    color-scheme: dark;',
    ...themeDecls('dark').map((l) => '  ' + l),
    '  }',
    '}',
    '',
    ':root[data-theme="dark"] {',
    '  color-scheme: dark;',
    ...themeDecls('dark'),
    '}',
    '',
].join('\n')

const colorKeys = [...resolved.light.keys()].filter((k) => k.startsWith('color.'))
const shadowKeys = [...resolved.light.keys()].filter((k) => k.startsWith('shadow.'))
const typeNames = [...new Set([...resolvedBase.keys()].filter((k) => k.startsWith('type.')).map((k) => k.split('.')[1]))]

const tailwind = header + [
    '/*',
    ' * Палитра Tailwind по умолчанию отключена (--color-*: initial): в интерфейсе',
    ' * нет классов gray-500 или blue-600, есть только роли. Класс вне ролей не',
    ' * сгенерируется, а ESLint (правило design-system/no-raw-palette) подсветит его.',
    ' */',
    '@theme inline {',
    '  --color-*: initial;',
    '  --color-transparent: transparent;',
    '  --color-current: currentColor;',
    '  --color-white: #ffffff;',
    '  --color-black: #000000;',
    ...colorKeys.map((k) => `  --color-${twColorName(k)}: var(${cssName(k)});`),
    '',
    '  --font-sans: var(--ds-font-family-sans);',
    '  --font-serif: var(--ds-font-family-serif);',
    '',
    '  --radius-xs: var(--ds-radius-xs);',
    '  --radius-sm: var(--ds-radius-s);',
    '  --radius-md: var(--ds-radius-s);',
    '  --radius-lg: var(--ds-radius-m);',
    '  --radius-xl: var(--ds-radius-l);',
    '  --radius-2xl: var(--ds-radius-l);',
    '  --radius-3xl: var(--ds-radius-xl);',
    '  --radius-field: var(--ds-radius-s);',
    '  --radius-tile: var(--ds-radius-m);',
    '  --radius-card: var(--ds-radius-l);',
    '  --radius-sheet: var(--ds-radius-xl);',
    '',
    ...shadowKeys.map((k) => `  --shadow-${k.split('.')[1]}: var(${cssName(k)});`),
    '',
    '  --ease-standard: var(--ds-motion-easing-standard);',
    '  --ease-emphasized: var(--ds-motion-easing-emphasized);',
    '',
    '  --spacing-touch: var(--ds-size-touch);',
    '  --spacing-control: var(--ds-size-control);',
    '  --spacing-tabbar: var(--ds-size-tabbar);',
    '  --spacing-screen-x: var(--ds-space-screen-x);',
    '  --container-content: var(--ds-size-content-max);',
    '}',
    '',
    ...typeNames.flatMap((n) => [
        `@utility type-${n} {`,
        `  font-family: var(--ds-type-${n}-family);`,
        `  font-size: var(--ds-type-${n}-size);`,
        `  line-height: var(--ds-type-${n}-line);`,
        `  font-weight: var(--ds-type-${n}-weight);`,
        `  letter-spacing: var(--ds-type-${n}-tracking);`,
        ...(n.startsWith('num') ? ['  font-variant-numeric: tabular-nums;'] : []),
        ...(n === 'overline' ? ['  text-transform: uppercase;'] : []),
        ...(n === 'quote' ? ['  font-style: italic;'] : []),
        '}',
        '',
    ]),
].join('\n')

const toObj = (m) => Object.fromEntries([...m].map(([k, t]) => [k, t.value]))
const varsObj = Object.fromEntries(
    [...resolved.light.keys()].filter((k) => k.startsWith('color.')).map((k) => [twColorName(k), `var(${cssName(k)})`]),
)

const tsHeader = '// Сгенерировано packages/design-tokens/scripts/build.mjs из tokens/*.json. Не править руками.\n'
const valuesObj = { base: toObj(resolvedBase), light: toObj(resolved.light), dark: toObj(resolved.dark) }
const js = tsHeader + [
    '',
    '/** CSS-переменная роли цвета по её имени в Tailwind: protein → var(--ds-color-macro-protein). Тема переключается сама. */',
    `export const color = Object.freeze(${JSON.stringify(varsObj, null, 4)})`,
    '',
    '/** Развёрнутые значения — там, где CSS-переменная недоступна: картинки OG, global-error, письма. */',
    `export const values = Object.freeze(${JSON.stringify(valuesObj, null, 4)})`,
    '',
].join('\n')
const dts = tsHeader + [
    '',
    `export declare const color: ${JSON.stringify(varsObj, null, 4).replace(/\n {4}"/g, '\n    readonly "')}`,
    '',
    'export type ColorRole = keyof typeof color',
    '',
    `export declare const values: { readonly base: Record<string, unknown>; readonly light: Readonly<Record<${JSON.stringify(Object.keys(valuesObj.light).sort()).slice(1, -1).split(',').join(' | ')}, string>>; readonly dark: Readonly<Record<${JSON.stringify(Object.keys(valuesObj.dark).sort()).slice(1, -1).split(',').join(' | ')}, string>> }`,
    '',
].join('\n')

const json = JSON.stringify(
    { $generated: 'packages/design-tokens/scripts/build.mjs', base: toObj(resolvedBase), light: toObj(resolved.light), dark: toObj(resolved.dark), contrast: contrastReport },
    null,
    2,
) + '\n'

// ---------------------------------------------------------------------------
// iOS: каталог цветов и Swift
// ---------------------------------------------------------------------------

/**
 * Относительный стиль Dynamic Type для каждого стиля текста: под ним размер
 * следует настройке «Размер текста». Взят ближайший по размеру системный стиль
 * (display 34 → largeTitle 34, caption 13 → footnote 13), кроме назначенных
 * проектом: title-1 → title, num-xl → largeTitle. Новый стиль текста без
 * строки здесь останавливает сборку: Dynamic Type не забывается молча.
 */
const IOS_TEXT_STYLE = {
    display: 'largeTitle',
    'title-1': 'title',
    'title-2': 'title2',
    'title-3': 'title3',
    quote: 'body',
    'num-xl': 'largeTitle',
    'num-l': 'title2',
    headline: 'headline',
    body: 'body',
    callout: 'callout',
    caption: 'footnote',
    overline: 'footnote',
    micro: 'caption2',
}
const IOS_TEXT_STYLES = ['largeTitle', 'title', 'title2', 'title3', 'headline', 'body', 'callout', 'subheadline', 'footnote', 'caption', 'caption2']

// Ключевые слова Swift: именем члена они годятся только в обратных кавычках.
const SWIFT_RESERVED = new Set([
    'associatedtype', 'borrowing', 'class', 'consuming', 'deinit', 'enum', 'extension', 'fileprivate', 'func', 'import', 'init', 'inout',
    'internal', 'let', 'nonisolated', 'open', 'operator', 'private', 'precedencegroup', 'protocol', 'public', 'rethrows', 'static', 'struct',
    'subscript', 'typealias', 'var', 'break', 'case', 'catch', 'continue', 'default', 'defer', 'do', 'else', 'fallthrough', 'for', 'guard',
    'if', 'in', 'repeat', 'return', 'throw', 'switch', 'where', 'while', 'Any', 'as', 'await', 'false', 'is', 'nil', 'self', 'Self', 'super',
    'throws', 'true', 'try', 'Type', 'Protocol',
])

const words = (path) => path.split(/[.\-_\s]+/).filter(Boolean)
const capitalize = (w) => w.charAt(0).toUpperCase() + w.slice(1)

/** Имя colorset: bg.canvas → BgCanvas, coach.fg-muted → CoachFgMuted. */
const iosColorName = (path) => words(path.replace(/^color\./, '')).map(capitalize).join('')

/**
 * Имя члена Swift: lowerCamelCase; ведущая цифра получает приставку
 * (space.4 → s4), ключевое слово — обратные кавычки (`default`).
 */
function swiftIdentifier(path, digitPrefix = 'n') {
    let id = words(path).map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : capitalize(w))).join('')
    if (/^[0-9]/.test(id)) id = digitPrefix + id
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) {
        errors.push(`iOS: из «${path}» не получается имя Swift`)
        return '_'
    }
    return SWIFT_RESERVED.has(id) ? `\`${id}\`` : id
}

/** JSON с отсортированными ключами: каталог не переписывается от порядка обхода. */
function stableJson(value) {
    const sort = (v) => {
        if (Array.isArray(v)) return v.map(sort)
        if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]))
        return v
    }
    return JSON.stringify(sort(value), null, 2) + '\n'
}

/** #RRGGBB или #RRGGBBAA → компоненты sRGB: каналы байтом, как в токене; альфа — долей. */
function srgbComponents(hex, role) {
    const h = String(hex).replace('#', '').toUpperCase()
    if (!/^[0-9A-F]{6}([0-9A-F]{2})?$/.test(h)) {
        errors.push(`iOS: цвет ${role} = ${hex} — ожидается #RRGGBB или #RRGGBBAA`)
        return {}
    }
    const alpha = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
    return { red: `0x${h.slice(0, 2)}`, green: `0x${h.slice(2, 4)}`, blue: `0x${h.slice(4, 6)}`, alpha: alpha.toFixed(3) }
}

const iosColorRoles = colorKeys.map((k) => ({ path: k, asset: iosColorName(k), member: swiftIdentifier(k.replace(/^color\./, '')) }))
for (const [i, r] of iosColorRoles.entries()) {
    const twin = iosColorRoles.findIndex((o) => o.asset === r.asset)
    if (twin !== i) errors.push(`iOS: роли ${iosColorRoles[twin].path} и ${r.path} дают одно имя ${r.asset}`)
}

const xcassets = 'dist/ios/Colors.xcassets'
const iosOutputs = { [`${xcassets}/Contents.json`]: stableJson({ info: { author: 'xcode', version: 1 } }) }
for (const r of iosColorRoles) {
    iosOutputs[`${xcassets}/${r.asset}.colorset/Contents.json`] = stableJson({
        colors: [
            { idiom: 'universal', color: { 'color-space': 'srgb', components: srgbComponents(resolved.light.get(r.path).value, `${r.path} (light)`) } },
            {
                idiom: 'universal',
                appearances: [{ appearance: 'luminosity', value: 'dark' }],
                color: { 'color-space': 'srgb', components: srgbComponents(resolved.dark.get(r.path).value, `${r.path} (dark)`) },
            },
        ],
        info: { author: 'xcode', version: 1 },
    })
}

/** "20px" → 20: pt на iOS соответствует px веба. */
function points(t, path) {
    const m = String(t?.value).match(/^(-?\d+(?:\.\d+)?)px$/)
    if (!m) { errors.push(`iOS: ${path} = ${t?.value} — ожидается значение в px`); return 0 }
    return Number(m[1])
}
// Округление до 4 знаков: -0.015 × 30 в двоичной арифметике — -0.44999999999999996.
const swiftNumber = (n) => String(Math.round(n * 10000) / 10000 || 0)

/** Имя семейства для Font.custom: первое в списке, кроме веб-обёртки «… Variable» из @fontsource. */
function iosFamily(key) {
    const name = (resolvedBase.get(`font.family.${key}`)?.value ?? []).find((f) => !/ Variable$/.test(f))
    if (!name) errors.push(`iOS: у font.family.${key} нет имени семейства для iOS`)
    return name
}

const dimensionGroup = (group, digitPrefix) => [...resolvedBase]
    .filter(([k]) => k.startsWith(`${group}.`))
    .map(([k, t]) => ({ name: swiftIdentifier(k.slice(group.length + 1), digitPrefix), value: points(t, k), description: t.description }))

const iosSpace = dimensionGroup('space', 's')
const iosRadius = dimensionGroup('radius', 'r')
const iosSize = dimensionGroup('size', 'z')

const families = [...resolvedBase.keys()].filter((k) => k.startsWith('font.family.')).map((k) => k.split('.')[2])
const iosTypography = typeNames.map((n) => {
    const get = (p) => resolvedBase.get(`type.${n}.${p}`)
    const relativeTo = IOS_TEXT_STYLE[n]
    if (!relativeTo) errors.push(`iOS: у стиля текста type.${n} нет относительного стиля Dynamic Type (IOS_TEXT_STYLE в build.mjs)`)
    else if (!IOS_TEXT_STYLES.includes(relativeTo)) errors.push(`iOS: type.${n} → ${relativeTo} — нет такого Font.TextStyle`)
    const size = points(get('size'), `type.${n}.size`)
    return {
        name: swiftIdentifier(n),
        family: swiftIdentifier(String(get('family')?.value)),
        size,
        lineHeight: points(get('line'), `type.${n}.line`),
        weight: Number(get('weight')?.value),
        tracking: Number(String(get('tracking')?.value).replace(/em$/, '')) * size,
        relativeTo,
        monospacedDigits: n.startsWith('num'),
        uppercase: n === 'overline',
        italic: n === 'quote',
    }
})

if (errors.length) {
    console.error('Токены не собраны:\n  ' + errors.join('\n  '))
    process.exit(1)
}

const swiftDoc = (text, indent) => (text ? [`${indent}/// ${text}`] : [])
const cgGroup = (name, items, about) => [
    `    /// ${about}`,
    `    public enum ${name} {`,
    ...items.flatMap((i) => [...swiftDoc(i.description, '        '), `        public static let ${i.name}: CGFloat = ${swiftNumber(i.value)}`]),
    '    }',
    '',
]
const swiftString = (s) => JSON.stringify(s)

const swift = [
    '// Сгенерировано packages/design-tokens/scripts/build.mjs из tokens/*.json. Не править руками.',
    '//',
    '// Исходник цели DesignSystem пакета VzveshenoKit. Colors.xcassets рядом — её',
    '// ресурс (`resources: [.process("Colors.xcassets")]`), отсюда `Bundle.module`.',
    '// Всё, что не требует SwiftUI, собирается и без него; цвета и шрифты — под',
    '// `#if canImport(SwiftUI)`.',
    '',
    'import Foundation',
    '',
    '#if canImport(SwiftUI)',
    'import SwiftUI',
    '#endif',
    '',
    'public enum DS {',
    '    /// Роли цвета; значение — имя colorset в Colors.xcassets. Светлый и тёмный вариант выбирает система.',
    '    public enum ColorRole: String, CaseIterable, Sendable {',
    ...iosColorRoles.map((r) => `        case ${r.member} = ${swiftString(r.asset)}`),
    '    }',
    '',
    ...cgGroup('Space', iosSpace, 'Отступы, сетка 4 pt. `s4` — шаг 4 шкалы (16 pt), а не 4 pt.'),
    ...cgGroup('Radius', iosRadius, 'Радиусы скругления, pt.'),
    ...cgGroup('Size', iosSize, 'Размеры, pt.'),
    '    /// Семейства шрифтов бренда — имена для `Font.custom`.',
    '    public enum FontFamily {',
    ...families.map((f) => `        public static let ${swiftIdentifier(f)} = ${swiftString(iosFamily(f))}`),
    '    }',
    '',
    '    /// Системный стиль, вслед за которым стиль бренда масштабируется с Dynamic Type; имена — как у `Font.TextStyle`.',
    '    public enum TextStyleRole: String, CaseIterable, Sendable {',
    ...IOS_TEXT_STYLES.map((s) => `        case ${s}`),
    '    }',
    '',
    '    /// Стиль текста. Размеры в pt; `tracking` — в pt для этого размера.',
    '    public struct TextStyle: Hashable, Sendable {',
    '        public let family: String',
    '        public let size: CGFloat',
    '        public let lineHeight: CGFloat',
    '        /// Вес по шкале CSS: 400 обычный, 500 средний, 600 полужирный.',
    '        public let weight: Int',
    '        public let tracking: CGFloat',
    '        public let relativeTo: TextStyleRole',
    '        /// Цифры одной ширины (tabular-nums).',
    '        public let monospacedDigits: Bool',
    '        public let uppercase: Bool',
    '        public let italic: Bool',
    '',
    '        /// Добавка к высоте строки до `lineHeight` (для `.lineSpacing`).',
    '        public var lineSpacing: CGFloat { lineHeight - size }',
    '    }',
    '',
    '    public enum Typography {',
    ...iosTypography.map((t) => `        public static let ${t.name} = TextStyle(family: FontFamily.${t.family}, size: ${swiftNumber(t.size)}, lineHeight: ${swiftNumber(t.lineHeight)}, weight: ${t.weight}, tracking: ${swiftNumber(t.tracking)}, relativeTo: .${t.relativeTo}, monospacedDigits: ${t.monospacedDigits}, uppercase: ${t.uppercase}, italic: ${t.italic})`),
    '    }',
    '}',
    '',
    '#if canImport(SwiftUI)',
    'extension DS {',
    '    /// Цвета ролей из каталога модуля DesignSystem. Литерал цвета вне DesignSystem запрещён SwiftLint (ds_color_literal).',
    '    public enum Color {',
    ...iosColorRoles.map((r) => `        public static var ${r.member}: SwiftUI.Color { SwiftUI.Color(${swiftString(r.asset)}, bundle: .module) }`),
    '    }',
    '}',
    '',
    'extension DS.ColorRole {',
    '    public var color: SwiftUI.Color { SwiftUI.Color(rawValue, bundle: .module) }',
    '}',
    '',
    'extension DS.TextStyleRole {',
    '    public var textStyle: SwiftUI.Font.TextStyle {',
    '        switch self {',
    ...IOS_TEXT_STYLES.map((s) => `        case .${s}: .${s}`),
    '        }',
    '    }',
    '}',
    '',
    'extension DS.TextStyle {',
    '    public var fontWeight: SwiftUI.Font.Weight {',
    '        switch weight {',
    '        case ..<150: .ultraLight',
    '        case ..<250: .thin',
    '        case ..<350: .light',
    '        case ..<450: .regular',
    '        case ..<550: .medium',
    '        case ..<650: .semibold',
    '        case ..<750: .bold',
    '        case ..<850: .heavy',
    '        default: .black',
    '        }',
    '    }',
    '',
    '    /// Шрифт бренда, масштабируемый с Dynamic Type относительно `relativeTo`.',
    '    public var font: SwiftUI.Font {',
    '        var font = SwiftUI.Font.custom(family, size: size, relativeTo: relativeTo.textStyle).weight(fontWeight)',
    '        if monospacedDigits { font = font.monospacedDigit() }',
    '        if italic { font = font.italic() }',
    '        return font',
    '    }',
    '}',
    '#endif',
    '',
].join('\n')
iosOutputs['dist/ios/Tokens.swift'] = swift

const outputs = { 'dist/tokens.css': css, 'dist/tailwind.css': tailwind, 'dist/tokens.js': js, 'dist/tokens.d.ts': dts, 'dist/tokens.json': json, ...iosOutputs }

/** Все файлы под каталогом, пути от корня пакета. */
function listFiles(rel) {
    if (!existsSync(join(root, rel))) return []
    return readdirSync(join(root, rel), { withFileTypes: true })
        .flatMap((e) => (e.isDirectory() ? listFiles(`${rel}/${e.name}`) : [`${rel}/${e.name}`]))
        .sort()
}

if (process.argv.includes('--check')) {
    const stale = Object.entries(outputs).filter(([p, c]) => !existsSync(join(root, p)) || readFileSync(join(root, p), 'utf8') !== c).map(([p]) => p)
    // dist/ios — каталог: colorset удалённой роли остался бы в нём и продолжал
    // собираться в приложение, поэтому лишний файл — тоже отставание.
    const extra = listFiles('dist/ios').filter((p) => !(p in outputs))
    if (stale.length || extra.length) {
        const why = []
        if (stale.length) why.push(`dist/ отстал от tokens/: ${stale.join(', ')}.`)
        if (extra.length) why.push(`В dist/ios лишние файлы, которых сборка не выпускает: ${extra.join(', ')}.`)
        console.error(`${why.join('\n')}\nЗапустите: npm run build --workspace=packages/design-tokens`)
        process.exit(1)
    }
    console.log('Токены в порядке: dist/ совпадает с источником, контраст и ссылки проверены.')
} else {
    // dist/ios собирается заново целиком: colorset удалённой роли не переживает сборку.
    rmSync(join(root, 'dist/ios'), { recursive: true, force: true })
    for (const [p, c] of Object.entries(outputs)) {
        mkdirSync(dirname(join(root, p)), { recursive: true })
        writeFileSync(join(root, p), c)
    }
    const worst = [...contrastReport].sort((a, b) => a.ratio / a.min - b.ratio / b.min).slice(0, 3)
    const ios = Object.keys(iosOutputs).length
    console.log(`Собрано: ${Object.keys(outputs).filter((p) => !(p in iosOutputs)).join(', ')} и ${ios} файлов dist/ios`)
    console.log('Ближе всего к порогу контраста:', worst.map((w) => `${w.theme} ${w.fg}/${w.bg} ${w.ratio}`).join('; '))
}
