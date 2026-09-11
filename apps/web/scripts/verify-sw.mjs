// Проверка, что service worker собрался и умеет то, ради чего он есть.
//
// Предыдущий не собирался вовсе: next-pwa — плагин webpack, сборка идёт
// Turbopack'ом, хук не вызывался. Ошибки не было, предупреждения не было,
// приложение просто годами называло себя устанавливаемым и работающим офлайн.
//
// Поэтому шаг сборки заканчивается утверждением, а не надеждой.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const path = 'public/sw.js'

if (!existsSync(path)) {
    console.error(`✗ ${path} не создан. Шаг build:sw либо не выполнился, либо ничего не сделал.`)
    process.exit(1)
}

const source = readFileSync(path, 'utf8')

const required = [
    ['предзагрузка', /precache|__SW_MANIFEST|revision/],
    ['показ уведомления', /showNotification/],
    ['переход по уведомлению', /notificationclick/],
    ['офлайн-экран', /offline/],
]

const missing = required.filter(([, pattern]) => !pattern.test(source)).map(([name]) => name)

if (missing.length > 0) {
    console.error(`✗ ${path} собран, но в нём нет: ${missing.join(', ')}.`)
    console.error('  Push и кэш живут в одном worker: потерять половину — значит тихо')
    console.error('  выключить уведомления или офлайн, ничего об этом не сообщив.')
    process.exit(1)
}

const kb = Math.round(source.length / 1024)
console.log(`✓ service worker на месте (${kb} КБ): предзагрузка, push, офлайн-экран`)

// Собранный воркер бесполезен, если его никто не подключает.
//
// Ровно это и случилось: next-pwa вставлял регистрацию сам, Serwist в режиме
// конфигуратора — нет, и какое-то время воркер собирался, отдавался по /sw.js
// и не был зарегистрирован ни у одного посетителя. Файл на месте, корректен,
// отдаётся с кодом 200 — и ничего не работает. Проверка содержимого такого не
// видит, поэтому здесь отдельный вопрос: есть ли в исходниках вызов register.

function sourceFiles(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
            if (['node_modules', '.next', '__tests__', '__mocks__'].includes(entry)) continue
            sourceFiles(full, out)
        } else if (['.ts', '.tsx'].includes(extname(full)) && !full.includes('.test.')) {
            out.push(full)
        }
    }
    return out
}

const registers = sourceFiles('src').some((file) =>
    /serviceWorker\s*\.\s*register\s*\(\s*['"`]\/sw\.js/.test(readFileSync(file, 'utf8')),
)

if (!registers) {
    console.error('✗ воркер собран, но ничто в src не вызывает navigator.serviceWorker.register("/sw.js").')
    console.error('  Он будет отдаваться по своему адресу и не работать ни у кого.')
    process.exit(1)
}

console.log('✓ регистрация воркера есть в исходниках')
