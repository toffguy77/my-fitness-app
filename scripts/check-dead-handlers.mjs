#!/usr/bin/env node
/**
 * Кнопка обязана что-то делать.
 *
 * За одну сессию нашлись две живые кнопки, не делавшие ничего:
 *
 *   «Отправить недельный отчёт» — заметная, пульсирующая, по воскресеньям:
 *       const handleSubmitReport = async () => {
 *           // TODO: Implement weekly report submission
 *           console.log('Submit weekly report')
 *       }
 *
 *   Стрелка «подробнее» на каждой задаче:
 *       const handleViewDetails = useCallback((taskId: string) => {
 *           // TODO: Navigate to task details page or open modal
 *       }, [])
 *
 * Обе были на виду и обе молчали: ни ошибки, ни подтверждения. Человек жмёт
 * и не понимает, сломалось ли что-то у него. Это хуже отсутствующей кнопки —
 * та хотя бы ничего не обещает.
 *
 * Сторож ловит обработчик, у которого в теле нет ничего, кроме комментариев
 * и вывода в консоль. `check-codebase-integrity.mjs` ловит то же самое в
 * обработчиках API — здесь тот же принцип для интерфейса.
 *
 * Запуск: node scripts/check-dead-handlers.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = process.env.CHECK_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'apps/web/src')

/** Объявление обработчика: const handleX = (...) => { ... } */
const HANDLER = /const\s+(handle[A-Za-z0-9_]*|on[A-Z][A-Za-z0-9_]*)\s*=\s*(?:useCallback\()?\s*(?:async\s*)?\([^)]*\)\s*(?::[^=]*)?=>\s*\{/g

/** Тело считается пустым, если в нём нет ни одного действия. */
function bodyIsEmpty(body) {
    const meaningful = body
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*'))
        .filter((line) => !/^console\.(log|debug|info)\(/.test(line))
        .filter((line) => line !== '}' && line !== '},' && line !== '}, [])')
    return meaningful.length === 0
}

/** Тело от открывающей скобки до парной ей. */
function bodyAfter(text, braceIndex) {
    let depth = 0
    for (let i = braceIndex; i < text.length; i += 1) {
        if (text[i] === '{') depth += 1
        else if (text[i] === '}') {
            depth -= 1
            if (depth === 0) return text.slice(braceIndex + 1, i)
        }
    }
    return ''
}

function* sourceFiles(dir) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
            if (entry === '__tests__' || entry === 'node_modules') continue
            yield* sourceFiles(full)
        } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
            yield full
        }
    }
}

let checked = 0
const dead = []

let files
try {
    files = [...sourceFiles(SOURCE)]
} catch {
    console.error(`не нашёл исходники: ${SOURCE}`)
    process.exit(1)
}

for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(HANDLER)) {
        checked += 1
        const braceIndex = match.index + match[0].length - 1
        if (bodyIsEmpty(bodyAfter(text, braceIndex))) {
            const line = text.slice(0, match.index).split('\n').length
            dead.push({ file: relative(ROOT, file), line, name: match[1] })
        }
    }
}

// Пол: ни одного обработчика во всём дереве означает, что разбор сломался.
if (checked === 0) {
    console.error(
        `В ${SOURCE} не нашлось ни одного обработчика.\n` +
            'Либо исходники переписаны, либо разбор сломан — в обоих случаях\n' +
            'этот сторож ничего не сторожит и молчать не должен.',
    )
    process.exit(1)
}

if (dead.length > 0) {
    console.error('Обработчики, которые ничего не делают:\n')
    for (const { file, line, name } of dead) {
        console.error(`  ${file}:${line} — ${name}`)
    }
    console.error(
        '\nКнопка, вызывающая такой обработчик, молчит в ответ на нажатие:\n' +
            'ни действия, ни ошибки. Это хуже отсутствующей кнопки.\n\n' +
            'Либо сделайте обработчик, либо уберите то, что его вызывает.',
    )
    process.exit(1)
}

console.log(`Обработчики интерфейса что-то делают: проверено ${checked}`)
