// Сборка service worker отдельным шагом, а не плагином.
//
// Плагин @serwist/next — как и next-pwa до него — цепляется к webpack, а этот
// проект собирается Turbopack'ом: хук не вызывается, worker не появляется, и
// ничего об этом не сообщается. Режим конфигуратора не зависит от сборщика:
// он читает готовый вывод next build и строит worker по нему.
//
// Порядок в package.json важен: сначала next build, потом этот шаг.

import { serwist } from '@serwist/next/config'

export default await serwist({
    swSrc: 'src/app/sw.ts',
    swDest: 'public/sw.js',
    // API никогда не кэшируется: устаревший ответ про чей-то дневник питания
    // хуже, чем отсутствие ответа.
    // offline.html кэшируется воркером вручную: преобразование путей Serwist
    // срезает расширение у html из public/ и оставляет несуществующий адрес.
    globIgnores: ['**/api/v1/**', 'public/offline.html'],
})
