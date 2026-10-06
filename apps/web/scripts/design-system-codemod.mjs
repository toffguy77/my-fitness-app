#!/usr/bin/env node
/**
 * Перевод классов палитры Tailwind на роли дизайн-системы.
 *
 *   node scripts/design-system-codemod.mjs [--dry] [пути…]   (по умолчанию src/)
 *
 * `bg-gray-50` → `bg-canvas`, `text-blue-600` → `text-primary`,
 * `border-red-500` → `border-danger`, `ring-blue-500` → `ring-focus` и т.д.
 * Модификаторы (`hover:`, `md:`) и прозрачность (`/50`) сохраняются.
 *
 * Скрипт остаётся в репозитории для веток, начатых до дизайн-системы:
 * прогоните его после слияния с dev, затем `npm run lint` покажет то, что
 * механическому переводу не поддаётся. Таблица — docs/design-system/README.md.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const NEUTRAL = ['slate', 'gray', 'zinc', 'neutral', 'stone']
const BRAND = ['blue', 'indigo', 'sky']
const DANGER = ['red', 'rose', 'pink']
const SUCCESS = ['green', 'emerald', 'lime', 'teal']
const WARNING = ['yellow', 'amber', 'orange']
const INFO = ['purple', 'violet', 'fuchsia', 'cyan']

const FAMILIES = [...NEUTRAL, ...BRAND, ...DANGER, ...SUCCESS, ...WARNING, ...INFO, 'white', 'black']
const PROPS = ['bg', 'text', 'border-[trblxy]', 'border', 'ring-offset', 'ring', 'from', 'via', 'to', 'fill', 'stroke', 'divide', 'outline', 'placeholder', 'accent', 'decoration', 'caret']

const pattern = new RegExp(
    String.raw`(?<![\w-])((?:[a-z0-9-]+:)*)(${PROPS.join('|')})-(${FAMILIES.join('|')})(?:-(\d{2,3}))?(\/\d{1,3})?(?![\w-])`,
    'g',
)

/** Роль для заливки/текста/границы по семейству и оттенку. */
function role(prop, family, shade) {
    const n = shade ? Number(shade) : null
    const kind = prop.startsWith('border') || prop === 'divide' || prop === 'outline' ? 'line'
        : prop === 'text' || prop === 'placeholder' || prop === 'decoration' || prop === 'caret' ? 'text'
        : prop.startsWith('ring') ? 'ring'
        : 'fill'

    if (family === 'white') {
        if (kind === 'text') return 'on-primary'
        return 'surface'
    }
    if (family === 'black') return kind === 'fill' ? 'scrim' : 'fg'

    if (NEUTRAL.includes(family)) {
        if (kind === 'ring') return 'focus'
        if (kind === 'text') {
            if (n >= 700) return 'fg'
            if (n >= 500) return 'fg-muted'
            if (n >= 300) return 'fg-subtle'
            return 'on-coach'
        }
        if (kind === 'line') return n >= 700 ? 'line-strong' : 'line'
        // fill
        if (n <= 50) return 'canvas'
        if (n <= 200) return 'subtle'
        if (n <= 500) return 'line'
        return 'coach'
    }

    const status = BRAND.includes(family) ? 'primary'
        : DANGER.includes(family) ? 'danger'
        : SUCCESS.includes(family) ? 'success'
        : WARNING.includes(family) ? 'warning'
        : 'info'

    if (kind === 'ring') return status === 'primary' ? 'focus' : status
    if (kind === 'text') return status === 'primary' ? 'primary' : `${status}-fg`
    if (kind === 'line') return n !== null && n <= 300 ? `${status}/30` : status
    // fill
    if (n !== null && n <= 200) return `${status}-soft`
    if (status === 'primary' && n !== null && n >= 700) return 'primary-hover'
    return status
}

function convert(source) {
    let count = 0
    const out = source.replace(pattern, (whole, variants, prop, family, shade, alpha) => {
        let r = role(prop, family, shade)
        // Прозрачность из исходного класса побеждает /30 по умолчанию.
        if (alpha) r = r.replace(/\/\d+$/, '') + alpha
        count++
        return `${variants}${prop}-${r}`
    })
    return { out, count }
}

function* walk(p) {
    const st = statSync(p)
    if (st.isDirectory()) {
        for (const e of readdirSync(p)) if (e !== 'node_modules' && !e.startsWith('.')) yield* walk(join(p, e))
    } else if (['.ts', '.tsx'].includes(extname(p))) yield p
}

const dry = process.argv.includes('--dry')
const targets = process.argv.slice(2).filter((a) => !a.startsWith('--'))
let files = 0, total = 0
for (const t of targets.length ? targets : ['src']) {
    for (const f of walk(t)) {
        const src = readFileSync(f, 'utf8')
        const { out, count } = convert(src)
        if (count) {
            files++; total += count
            if (!dry) writeFileSync(f, out)
        }
    }
}
console.log(`${dry ? '[dry] ' : ''}заменено классов: ${total} в файлах: ${files}`)

export { convert, role }
