#!/usr/bin/env node
/**
 * Настройка в окружении выкатки обязана доходить до кода.
 *
 * `docker-compose.yml` перечисляет переменные поимённо: что в нём не названо,
 * внутрь контейнера не попадает никогда. Значит переменная, объявленная в
 * `deploy/env/*.example`, но не потребляемая составом, — это настройка,
 * которую можно задать и которая ничего не делает. Хуже, чем её отсутствие:
 * она выглядит рабочей.
 *
 * Так и было: в примерах лежали двенадцать таких. `CORS_ORIGIN` обещал, что
 * источники запросов ограничиваются настройкой, — не ограничивались никак.
 * `DEBUG_MODE`, `NEXT_PUBLIC_LOG_LEVEL`, `ENABLE_USER_FLOW_LOGGING` обещали
 * управление отладкой на проде. `RESEND_API_KEY` описывал почтового
 * провайдера, которым продукт не пользуется (почта уходит по SMTP).
 * `NEXT_PUBLIC_OPENROUTER_API_KEY` — секрет с публичной приставкой, ровно то,
 * что запрещает check-codebase-integrity.mjs в коде, но примеры он не смотрел.
 * `DATABASE_URL` сервер читает, но в контейнер он не передаётся: строка
 * собирается из DB_*, и заданный целиком он молча ни на что не влияет.
 *
 * Ни одна из двенадцати не читалась вообще ничем.
 *
 * «Потребляется» — это либо проброс в сервис (`- ИМЯ=`), либо подстановка
 * самим составом (`${ИМЯ}`): второе тоже работа, просто на другом уровне.
 *
 * Запуск: node scripts/check-deploy-env.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = process.env.CHECK_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..')
const COMPOSE = join(ROOT, 'docker-compose.yml')
const ENV_DIR = join(ROOT, 'deploy/env')

/** Имена, которые составу знать и не надо, — с причиной на каждое. */
const EXEMPT = new Map([
    // Пример заполняется человеком и сам себя комментирует; сюда попадают
    // только настоящие исключения, если появятся.
])

function read(path, what) {
    try {
        return readFileSync(path, 'utf8')
    } catch {
        console.error(`не нашёл ${what}: ${path}`)
        process.exit(1)
    }
}

const compose = read(COMPOSE, 'состав docker-compose')

const forwarded = new Set(
    [...compose.matchAll(/^\s*-\s*([A-Z_0-9]+)=/gm)].map((m) => m[1]),
)
const interpolated = new Set(
    [...compose.matchAll(/\$\{([A-Z_0-9]+)/g)].map((m) => m[1]),
)
const consumed = new Set([...forwarded, ...interpolated])

if (consumed.size === 0) {
    console.error(
        `В ${COMPOSE} не нашлось ни одной переменной.\n` +
            'Состав переписан или разбор сломан — в обоих случаях этот сторож\n' +
            'ничего не сторожит и молчать не должен.',
    )
    process.exit(1)
}

let files
try {
    files = readdirSync(ENV_DIR).filter((f) => f.endsWith('.example'))
} catch {
    console.error(`не нашёл каталог окружений выкатки: ${ENV_DIR}`)
    process.exit(1)
}

if (files.length === 0) {
    console.error(`В ${ENV_DIR} нет ни одного файла-примера — сверять нечего.`)
    process.exit(1)
}

const dead = []
let declared = 0

for (const file of files) {
    const text = readFileSync(join(ENV_DIR, file), 'utf8')
    text.split('\n').forEach((line, index) => {
        const match = line.match(/^([A-Z_0-9]+)=/)
        if (!match) return
        declared += 1
        const name = match[1]
        if (consumed.has(name) || EXEMPT.has(name)) return
        dead.push({ file, line: index + 1, name })
    })
}

if (declared === 0) {
    console.error(
        `В ${ENV_DIR} не объявлено ни одной переменной.\n` +
            'Либо примеры пусты, либо разбор сломан — сторож ослеп.',
    )
    process.exit(1)
}

if (dead.length > 0) {
    console.error('Настройки выкатки, которые никуда не доходят:\n')
    for (const { file, line, name } of dead) {
        console.error(`  deploy/env/${file}:${line} — ${name}`)
    }
    console.error(
        '\nВ docker-compose.yml переменные перечислены поимённо: не названная\n' +
            'там внутрь контейнера не попадает. Такую настройку можно задать, и\n' +
            'она ничего не сделает — это хуже, чем её отсутствие.\n\n' +
            'Либо пробросьте её в нужный сервис, либо уберите из примера.',
    )
    process.exit(1)
}

console.log(`Настройки выкатки доходят до кода: проверено ${declared} в ${files.length} файлах`)
