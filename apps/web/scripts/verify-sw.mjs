// Проверка, что service worker собрался и умеет то, ради чего он есть.
//
// Предыдущий не собирался вовсе: next-pwa — плагин webpack, сборка идёт
// Turbopack'ом, хук не вызывался. Ошибки не было, предупреждения не было,
// приложение просто годами называло себя устанавливаемым и работающим офлайн.
//
// Поэтому шаг сборки заканчивается утверждением, а не надеждой.

import { readFileSync, existsSync } from 'node:fs'

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
