/**
 * Возврат входа в iOS-приложение «Взвешено» (universal link).
 *
 * Сюда сервер уводит вход через Яндекс или VK, начатый из приложения, с
 * одноразовым кодом (?code=) или причиной отказа (?error=). Приложение
 * перехватывает этот адрес до загрузки: ASWebAuthenticationSession отдаёт
 * его только приложению с подтверждённым доменом (apple-app-site-association).
 * Страница видна, только если адрес открылся в браузере — приложения на
 * телефоне нет или вход начат не из него.
 *
 * Код в адресе должен остаться здесь: страница без скриптов, счётчиков и
 * внешних ресурсов, без Referer и без кэша, иначе адрес с кодом ушёл бы
 * третьей стороне. Поэтому это обработчик со статичной разметкой, а не
 * страница приложения с общим макетом и аналитикой.
 */
export function GET() {
    const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Взвешено</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5">
<h1 style="font-size:1.25rem">Откройте приложение Взвешено</h1>
<p>Вход завершается в приложении «Взвешено» на телефоне. Если приложения нет или вы начинали вход не из него, войдите на сайте.</p>
<p><a href="/auth">Войти на сайте</a></p>
</body></html>`
    return new Response(html, {
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Referrer-Policy': 'no-referrer',
            'Cache-Control': 'no-store',
            'X-Robots-Tag': 'noindex',
            'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
        },
    })
}
