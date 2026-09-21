#!/usr/bin/env node
/**
 * Каждый адрес, который E2E вводит в форму, обязан попадать под шаблоны
 * зачистки — или быть названным здесь с причиной.
 *
 * Прогон на рабочем сервере безопасен ровно настолько, насколько полна
 * зачистка. Учётки она находит по списку (его полноту стережёт
 * check-e2e-cleanup-covers-accounts.mjs), а всё гостевое — по шаблонам
 * адреса: `e2e-lead-%`, `widget-e2e-%`, `%@burcev.test`. Адрес, не подошедший
 * ни под один, зачистке не виден: заявка и привязанный к ней веб-разговор
 * остаются на проде навсегда, а скрипт отчитывается об успехе — он про этот
 * адрес не спрашивал.
 *
 * Так и было: support-widget.spec.ts оставлял контакт на
 * `widget-e2e@example.com`. Под `widget-e2e-%` он не подходит (нет дефиса),
 * под `%@burcev.test` — тоже. Соседняя строка того же файла отличалась одним
 * дефисом и была покрыта.
 *
 * Адрес, который данных не создаёт (неверный пароль, несуществующий ящик в
 * «забыли пароль») или вовсе не вводится, а проверяется как текст страницы,
 * вносится в ALLOWED ниже вместе с причиной. Список — не формальность:
 * решение «этот адрес зачищать не нужно» должно быть принято человеком и
 * записано, а не выведено скриптом из формы адреса.
 *
 * Запуск: node scripts/check-e2e-guest-emails.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = process.env.CHECK_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..')
const TESTS_DIR = join(ROOT, 'e2e/tests')
const SNAPSHOT = join(ROOT, 'scripts/e2e-db-snapshot.sh')

/** Адреса, которым зачистка не нужна — с причиной, по одной на адрес. */
const ALLOWED = new Map([
    ['wrong@example.com', 'вводится при заведомо неудачном входе — строки не заводит'],
    ['test@example.com', 'несуществующий ящик в «забыли пароль»: ответ одинаков, записи нет'],
    ['privacy@burcev.team', 'проверяется как текст страницы политики, никуда не вводится'],
    ['legal@burcev.team', 'проверяется как текст страницы условий, никуда не вводится'],
])

function read(path, what) {
    try {
        return readFileSync(path, 'utf8')
    } catch {
        console.error(`не нашёл ${what}: ${path}`)
        process.exit(1)
    }
}

// Шаблоны берём из скрипта слепка, а не переписываем сюда: переписанный
// список разошёлся бы с настоящим ровно тем же образом, что и любой другой.
const snapshot = read(SNAPSHOT, 'скрипт слепка')
const defaults = snapshot.match(/DEFAULT_GUEST_PATTERNS="([^"]+)"/)
if (!defaults) {
    console.error(
        `В ${SNAPSHOT} не нашлись шаблоны гостевых адресов (DEFAULT_GUEST_PATTERNS).\n` +
            'Скрипт слепка переписан — сверять стало не с чем.',
    )
    process.exit(1)
}
const patterns = defaults[1]
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)

/** LIKE-шаблон Postgres → регулярка. Экранируем всё, кроме % и _. */
function likeToRegExp(pattern) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`^${escaped.replace(/%/g, '.*').replace(/_/g, '.')}$`, 'i')
}
const matchers = patterns.map(likeToRegExp)

// Интерполяции в шаблонных строках сворачиваем в «что угодно»: адрес
// `widget-e2e-${Date.now()}@burcev.test` сверяется как `widget-e2e-*@burcev.test`.
const EMAIL = /[A-Za-z0-9._%+-]*(?:\$\{[^}]*\}[A-Za-z0-9._%+-]*)*@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

function normalise(raw) {
    return raw.replace(/\$\{[^}]*\}/g, '*')
}

/**
 * Совпадает ли адрес хоть с одним шаблоном.
 *
 * Звёздочка на месте интерполяции сверяется как обычный символ, и этого
 * достаточно: `%` шаблона превратилось в `.*`, которое её и поглощает —
 * `widget-e2e-%` принимает `widget-e2e-*@burcev.test`. Обратного направления
 * (шаблон против адреса) здесь сознательно нет: оно принимало бы адреса
 * шире, чем зачистка их действительно найдёт.
 */
function covered(address) {
    return matchers.some((m) => m.test(address))
}

let files
try {
    files = readdirSync(TESTS_DIR).filter((f) => f.endsWith('.ts'))
} catch {
    console.error(`не нашёл каталог спек: ${TESTS_DIR}`)
    process.exit(1)
}

const offenders = []
let seen = 0

for (const file of files) {
    const text = readFileSync(join(TESTS_DIR, file), 'utf8')
    text.split('\n').forEach((line, index) => {
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) {
            return
        }
        for (const raw of line.match(EMAIL) ?? []) {
            seen += 1
            const address = normalise(raw)
            if (ALLOWED.has(address) || covered(address)) {
                continue
            }
            offenders.push({ file, line: index + 1, address })
        }
    })
}

// Пол: ни одного адреса во всём каталоге означает, что регулярка перестала
// совпадать, а не что спеки чисты.
if (seen === 0) {
    console.error(
        `В ${TESTS_DIR} не нашлось ни одного адреса.\n` +
            'Либо спеки переписаны, либо разбор сломан — в обоих случаях этот\n' +
            'сторож ничего не сторожит и молчать не должен.',
    )
    process.exit(1)
}

if (offenders.length > 0) {
    console.error('Адреса в E2E, которых не найдёт зачистка:\n')
    for (const { file, line, address } of offenders) {
        console.error(`  e2e/tests/${file}:${line} — ${address}`)
    }
    console.error(
        `\nШаблоны зачистки: ${patterns.join(', ')}\n\n` +
            'Либо приведите адрес под шаблон (обычно достаточно @burcev.test),\n' +
            'либо внесите его в ALLOWED в scripts/check-e2e-guest-emails.mjs\n' +
            'с причиной, по которой зачищать его не нужно.',
    )
    process.exit(1)
}

console.log(`Адреса E2E покрыты зачисткой: проверено ${seen}, шаблонов ${patterns.length}`)
