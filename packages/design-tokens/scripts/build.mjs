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
 *   dist/tokens.json    развёрнутые значения обеих тем — для iOS/Android
 *
 * Сборка же и проверяет то, что иначе разъезжается молча:
 *   - ссылка {palette.x.y} указывает на существующий токен;
 *   - у светлой и тёмной темы один и тот же набор ролей;
 *   - пары «текст на фоне» держат контраст WCAG (см. CONTRAST_PAIRS).
 *
 * `node scripts/build.mjs --check` ничего не пишет и падает, если dist/ отстал
 * от источника. Его вызывает CI.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
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

const outputs = { 'dist/tokens.css': css, 'dist/tailwind.css': tailwind, 'dist/tokens.js': js, 'dist/tokens.d.ts': dts, 'dist/tokens.json': json }

if (process.argv.includes('--check')) {
    const stale = Object.entries(outputs).filter(([p, c]) => !existsSync(join(root, p)) || readFileSync(join(root, p), 'utf8') !== c)
    if (stale.length) {
        console.error(`dist/ отстал от tokens/: ${stale.map(([p]) => p).join(', ')}.\nЗапустите: npm run build --workspace=packages/design-tokens`)
        process.exit(1)
    }
    console.log('Токены в порядке: dist/ совпадает с источником, контраст и ссылки проверены.')
} else {
    mkdirSync(join(root, 'dist'), { recursive: true })
    for (const [p, c] of Object.entries(outputs)) writeFileSync(join(root, p), c)
    const worst = [...contrastReport].sort((a, b) => a.ratio / a.min - b.ratio / b.min).slice(0, 3)
    console.log(`Собрано: ${Object.keys(outputs).join(', ')}`)
    console.log('Ближе всего к порогу контраста:', worst.map((w) => `${w.theme} ${w.fg}/${w.bg} ${w.ratio}`).join('; '))
}
