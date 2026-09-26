#!/usr/bin/env node
/**
 * Собирает миграцию справочника нутриентов из МР 2.3.1.0253-21.
 *
 * Справочник `nutrient_recommendations` — это суточные нормы витаминов и
 * минеральных веществ, то есть медицинские референсные значения рядом с весом и
 * калориями человека. Перепечатать 33 строки руками — значит однажды опечататься
 * в цифре, которую никто не перепроверит: в базе она будет выглядеть так же
 * уверенно, как правильная.
 *
 * Поэтому цифры берутся **из двух независимых мест одного документа**:
 *
 *   1. из таблиц 11, 12, 16, 17 (нормы) и 13, 18 (адекватные уровни) — они
 *      прочитаны глазами и записаны ниже в `FROM_TABLES`;
 *   2. из прозы раздела 4.2.2, где та же величина названа словами:
 *      «Физиологическая потребность для взрослых – 100 мг/сутки».
 *
 * Второе разбирается из текста и сверяется с первым. Расхождение роняет скрипт и
 * называет нутриент. Совпадение означает, что одна и та же величина прочитана
 * двумя разными способами.
 *
 * ## Как запустить
 *
 *   # 1. Скачать документ (он же источник, записанный в каждой строке):
 *   curl -o mr.pdf 'http://web.ion.ru/files/Нормы физиологических потребностей 2021.pdf'
 *   # 2. Получить текст любым извлекателем, например:
 *   pdftotext -layout mr.pdf mr.txt
 *   # 3. Собрать SQL:
 *   node scripts/nutrient-norms-from-mr.mjs mr.txt > out.sql
 *
 * Скрипт нарочно принимает текст, а не PDF: разбор PDF потребовал бы зависимости
 * ради одного запуска, а текст даёт любой инструмент.
 *
 * ## Когда его звать снова
 *
 * Когда документ заменят — как МР 2.3.1.0253-21 заменили МР 2.3.1.2432-08.
 * Тогда меняется `FROM_TABLES` (новые цифры читаются глазами), а сверка с прозой
 * скажет, не ошиблись ли при чтении.
 */
import { readFileSync } from 'node:fs'

const SOURCE = 'МР 2.3.1.0253-21'
const SOURCE_VERSION = '2021-07-22'

/**
 * Прочитано глазами из таблиц документа.
 *
 * `male` / `female` — норма для взрослых от 18 лет; `older` — норма с 65 лет,
 * если документ её выделяет. `adequate: true` — «адекватный уровень
 * потребления» (табл. 13, 18), а не физиологическая потребность: документ
 * различает это, и мы различаем.
 *
 * Порядок совпадает с порядком изложения в разделе 4.2.2 — по нему ищутся блоки
 * прозы, иначе «Витамин С» из чужого абзаца увёл бы границу не туда.
 */
const FROM_TABLES = [
    { name: 'Витамин C', marker: 'Витамин С', category: 'vitamins', unit: 'mg', male: 100, female: 100, tables: 'табл. 11, 16' },
    { name: 'Витамин B1 (тиамин)', marker: 'Витамин В1', category: 'vitamins', unit: 'mg', male: 1.5, female: 1.5, tables: 'табл. 11, 16' },
    { name: 'Витамин B2 (рибофлавин)', marker: 'Витамин В2', category: 'vitamins', unit: 'mg', male: 1.8, female: 1.8, tables: 'табл. 11, 16' },
    { name: 'Витамин B6', marker: 'Витамин В6', category: 'vitamins', unit: 'mg', male: 2.0, female: 2.0, tables: 'табл. 11, 16' },
    { name: 'Ниацин', marker: 'Ниацин', category: 'vitamins', unit: 'mg', male: 20, female: 20, tables: 'табл. 11, 16', note: 'в ниациновом эквиваленте' },
    { name: 'Витамин B12', marker: 'Витамин В12', category: 'vitamins', unit: 'mcg', male: 3.0, female: 3.0, tables: 'табл. 11, 16' },
    { name: 'Фолаты', marker: 'Фолаты', category: 'vitamins', unit: 'mcg', male: 400, female: 400, tables: 'табл. 11, 16' },
    { name: 'Пантотеновая кислота', marker: 'Пантотеновая кислота', category: 'vitamins', unit: 'mg', male: 5, female: 5, tables: 'табл. 11, 16' },
    { name: 'Биотин', marker: 'Биотин', category: 'vitamins', unit: 'mcg', male: 50, female: 50, tables: 'табл. 11, 16' },
    { name: 'Витамин A', marker: 'Витамин А', category: 'vitamins', unit: 'mcg', male: 900, female: 800, tables: 'табл. 11, 16', note: 'в ретиноловом эквиваленте' },
    { name: 'Бета-каротин', marker: 'Бета-каротин', category: 'vitamins', unit: 'mg', male: 5, female: 5, tables: 'табл. 11, 16' },
    { name: 'Витамин E', marker: 'Витамин Е', category: 'vitamins', unit: 'mg', male: 15, female: 15, tables: 'табл. 11, 16', note: 'в токофероловом эквиваленте' },
    { name: 'Витамин D', marker: 'Витамин D', category: 'vitamins', unit: 'mcg', male: 15, female: 15, older: 20, tables: 'табл. 11, 16' },
    { name: 'Витамин K', marker: 'Витамин К', category: 'vitamins', unit: 'mcg', male: 120, female: 120, tables: 'табл. 11, 16' },

    { name: 'Кальций', marker: 'Кальций', category: 'minerals', unit: 'mg', male: 1000, female: 1000, older: 1200, tables: 'табл. 12, 17' },
    { name: 'Фосфор', marker: 'Фосфор', category: 'minerals', unit: 'mg', male: 700, female: 700, tables: 'табл. 12, 17' },
    { name: 'Магний', marker: 'Магний', category: 'minerals', unit: 'mg', male: 420, female: 420, tables: 'табл. 12, 17' },
    { name: 'Калий', marker: 'Калий', category: 'minerals', unit: 'mg', male: 3500, female: 3500, tables: 'табл. 12, 17' },
    { name: 'Натрий', marker: 'Натрий', category: 'minerals', unit: 'mg', male: 1300, female: 1300, tables: 'табл. 12, 17' },
    { name: 'Хлориды', marker: 'Хлориды', category: 'minerals', unit: 'mg', male: 2300, female: 2300, tables: 'табл. 12, 17' },
    { name: 'Железо', marker: 'Железо', category: 'minerals', unit: 'mg', male: 10, female: 18, tables: 'табл. 12, 17' },
    { name: 'Цинк', marker: 'Цинк', category: 'minerals', unit: 'mg', male: 12, female: 12, tables: 'табл. 12, 17' },
    { name: 'Йод', marker: 'Йод', category: 'minerals', unit: 'mcg', male: 150, female: 150, tables: 'табл. 12, 17' },
    { name: 'Медь', marker: 'Медь', category: 'minerals', unit: 'mg', male: 1.0, female: 1.0, tables: 'табл. 12, 17' },
    { name: 'Марганец', marker: 'Марганец', category: 'minerals', unit: 'mg', male: 2, female: 2, tables: 'табл. 12, 17' },
    { name: 'Молибден', marker: 'Молибден', category: 'minerals', unit: 'mcg', male: 70, female: 70, tables: 'табл. 12, 17' },
    { name: 'Селен', marker: 'Селен', category: 'minerals', unit: 'mcg', male: 70, female: 55, tables: 'табл. 12, 17' },
    { name: 'Хром', marker: 'Хром', category: 'minerals', unit: 'mcg', male: 40, female: 40, tables: 'табл. 12, 17' },

    { name: 'Кобальт', marker: 'Кобальт', category: 'minerals', unit: 'mcg', male: 10, female: 10, adequate: true, tables: 'табл. 13, 18' },
    { name: 'Фтор', marker: 'Фтор', category: 'minerals', unit: 'mg', male: 4, female: 4, adequate: true, tables: 'табл. 13, 18' },
    { name: 'Кремний', marker: 'Кремний', category: 'minerals', unit: 'mg', male: 30, female: 30, adequate: true, tables: 'табл. 13, 18' },
    { name: 'Ванадий', marker: 'Ванадий', category: 'minerals', unit: 'mcg', male: 15, female: 15, adequate: true, tables: 'табл. 13, 18' },
]

/**
 * Пищевые волокна стоят отдельно: они не микронутриент и описаны не в разделе
 * 4.2.2, а в 4.2.1, другой формулировкой — «Физиологическая потребность в
 * пищевых волокнах для взрослого человека составляет 20—25 г/сутки». Норма
 * задана вилкой, поэтому у неё есть минимум и оптимум, а не одно число.
 */
const FIBER = {
    name: 'Пищевые волокна',
    marker: 'Пищевые волокна',
    category: 'fiber',
    unit: 'g',
    male: 20,
    female: 20,
    min: 20,
    optimal: 25,
    tables: 'табл. 10, 14; п. 4.2.1',
    needle: /Физиологическая потребность в пищевых волокнах для взрослого человека составляет[\s\S]*?\./,
}

// ============================================================================
// Разбор текста
// ============================================================================

/**
 * Приводит извлечённый из PDF текст к одной строке: убирает колонтитулы,
 * номера страниц, табуляции внутри строк таблиц и переносы по слогам
 * («Отно-\nсится» → «Относится»).
 */
function clean(raw) {
    let text = raw
        .replace(/-- \d+ of \d+ --/g, '\n')
        .replace(/МР 2\.3\.1\.0253[—-]21/g, '\n')
        .replace(/\t+/g, ' ')
    text = text
        .split('\n')
        .filter((line) => !/^\s*\d{1,3}\s*$/.test(line))
        .join('\n')
    return text
        .replace(/([а-яё])-\n\s*([а-яё])/g, '$1$2')
        .replace(/\n+/g, ' ')
        .replace(/\s{2,}/g, ' ')
}

/** Величины, названные в прозе. Из них и сверяется то, что прочитано в таблицах. */
function proseRequirement(block) {
    const m = block.match(
        /(?:Уточненная\s+)?(?:физиологическая потребность|адекватный уровень потребления) для (?:взрослых|мужчин)[\s\S]*?\.(?=\s*(?:Физиологическая|Уточненная|Адекватный|$))/i
    )
    return m ? m[0].replace(/\s+/g, ' ') : null
}

/** Что нутриент делает: проза до первой фразы о недостатке или о норме. */
function head(block) {
    const stops = [/Дефицит/, /Недостаток/, /Недостаточное потребление/, /При дефиците/, /Физиологическая потребность/, /Адекватный уровень/, /Уточненная/]
    const cut = Math.min(
        ...stops.map((re) => {
            const at = block.search(re)
            return at < 0 ? block.length : at
        })
    )
    return block.slice(0, cut).trim().replace(/\s+/g, ' ')
}

/** К чему ведёт недостаток — если источник об этом говорит. */
function deficiency(block) {
    const m = block.match(
        /(?:Дефицит|Недостаток|Недостаточное потребление|При дефиците)[\s\S]*?\.(?=\s*(?:Физиологическая|Адекватный|Уточненная|$))/
    )
    return m ? m[0].replace(/\s+/g, ' ') : null
}

function extract(textPath) {
    const text = clean(readFileSync(textPath, 'utf8'))

    const from = text.indexOf('4.2.2.1. Витамины')
    const to = text.indexOf('4.2.3. Минорные')
    if (from < 0 || to < 0) {
        throw new Error('в тексте не нашлось раздела 4.2.2 — это тот документ?')
    }
    const section = text.slice(from, to)

    // Блоки ищутся по порядку изложения: следующий маркер — после предыдущего.
    let cursor = 0
    const found = FROM_TABLES.map((nutrient) => {
        const escaped = nutrient.marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const re = new RegExp(`(^|\\s)${escaped}(?=[\\s.(])`, 'g')
        re.lastIndex = cursor
        const m = re.exec(section)
        if (!m) return { ...nutrient, at: -1 }
        const at = m.index + m[1].length
        cursor = at + escaped.length
        return { ...nutrient, at }
    })

    const missing = found.filter((n) => n.at < 0)
    if (missing.length > 0) {
        throw new Error(`в прозе не нашлись блоки: ${missing.map((n) => n.marker).join(', ')}`)
    }

    const nutrients = found.map((nutrient, i) => {
        const end = i + 1 < found.length ? found[i + 1].at : section.length
        const block = section.slice(nutrient.at, end).trim()
        return {
            ...nutrient,
            description: head(block),
            effects: deficiency(block),
            prose: proseRequirement(block),
        }
    })

    // Пищевые волокна — из другого раздела и другой формулировкой.
    const fiberAt = text.indexOf('Пищевые волокна – съедобные части растений')
    if (fiberAt < 0) throw new Error('не нашёлся раздел о пищевых волокнах')
    const fiberBlock = text.slice(fiberAt, fiberAt + 2500)
    const fiberProse = fiberBlock.match(FIBER.needle)
    nutrients.push({
        ...FIBER,
        description: head(fiberBlock),
        effects: null,
        prose: fiberProse ? fiberProse[0].replace(/\s+/g, ' ') : null,
    })

    return nutrients
}

/**
 * Сверка: каждая величина, прочитанная в таблице, обязана встретиться в прозе.
 *
 * Это и есть защита от опечатки. Ошибиться дважды одинаково — в таблице и в
 * тексте — можно, но для этого надо прочитать не тот документ целиком.
 */
function crossCheck(nutrients) {
    const problems = []
    for (const n of nutrients) {
        if (!n.prose) {
            problems.push(`${n.name}: в прозе не нашлось величины`)
            continue
        }
        const inProse = [...n.prose.matchAll(/(\d+(?:[.,]\d+)?)/g)].map((m) => Number(m[1].replace(',', '.')))
        for (const wanted of [n.male, n.female, n.older, n.optimal].filter((v) => v !== undefined)) {
            if (!inProse.some((v) => Math.abs(v - wanted) < 1e-9)) {
                problems.push(`${n.name}: в таблице ${wanted}, в прозе «${n.prose}»`)
            }
        }
    }
    return problems
}

// ============================================================================
// SQL
// ============================================================================

const quote = (value) => (value === null || value === undefined ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`)
const number = (value) => (value === null || value === undefined ? 'NULL' : String(value))

/**
 * Нормы задаются порогом «от возраста», а не диапазоном: пересечься двум
 * порогам нельзя по построению, а применяется наибольший подходящий. Иначе для
 * запрета пересечений понадобилось бы исключающее ограничение и расширение
 * btree_gist на управляемой базе.
 */
function normRows(n) {
    const rows = []
    const kind = n.adequate ? 'адекватный уровень потребления' : 'физиологическая потребность'
    const note = `${n.tables}; ${kind}`

    if (n.male === n.female) {
        rows.push({ sex: 'any', minAge: 18, target: n.male, note })
        if (n.older !== undefined) rows.push({ sex: 'any', minAge: 65, target: n.older, note })
    } else {
        rows.push({ sex: 'male', minAge: 18, target: n.male, note })
        rows.push({ sex: 'female', minAge: 18, target: n.female, note })
        if (n.older !== undefined) {
            rows.push({ sex: 'male', minAge: 65, target: n.older, note })
            rows.push({ sex: 'female', minAge: 65, target: n.older, note })
        }
    }
    return rows.map((row) => ({ ...row, min: n.min, optimal: n.optimal }))
}

function toSQL(nutrients) {
    const out = []
    out.push('-- Сгенерировано scripts/nutrient-norms-from-mr.mjs из МР 2.3.1.0253-21.')
    out.push('-- Цифры сверены между таблицами документа и его прозой; см. шапку скрипта.')
    out.push('')

    for (const n of nutrients) {
        const description = [n.description, n.note ? `Норма ${n.note}.` : null].filter(Boolean).join(' ')
        out.push(`-- ${n.name}: ${n.prose}`)
        out.push(
            'INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)',
            `VALUES (${quote(n.name)}, ${quote(n.category)}, ${quote(n.unit)}, false, ${quote(description)}, ${quote(n.effects)}, ${quote(SOURCE)}, ${quote(SOURCE_VERSION)});`
        )
        for (const row of normRows(n)) {
            out.push(
                'INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)',
                `SELECT id, ${quote(row.sex)}, ${row.minAge}, ${number(row.target)}, ${number(row.min)}, ${number(row.optimal)}, ${quote(SOURCE)}, ${quote(SOURCE_VERSION)}, ${quote(row.note)}`,
                `FROM nutrient_recommendations WHERE name = ${quote(n.name)};`
            )
        }
        out.push('')
    }
    return out.join('\n')
}

// ============================================================================

const [textPath] = process.argv.slice(2)
if (!textPath) {
    console.error('Использование: node scripts/nutrient-norms-from-mr.mjs <текст МР 2.3.1.0253-21>')
    process.exit(2)
}

const nutrients = extract(textPath)
const problems = crossCheck(nutrients)

if (problems.length > 0) {
    console.error('Таблицы и проза документа расходятся — данные не собраны:\n')
    for (const problem of problems) console.error(`  ${problem}`)
    console.error('\nПроверьте цифру в FROM_TABLES по документу, а не подгоняйте сверку.')
    process.exit(1)
}

console.error(`Сверено с прозой: ${nutrients.length} нутриентов, расхождений нет.`)
process.stdout.write(toSQL(nutrients))
