/**
 * Возврат входа через Яндекс/VK в iOS-приложение.
 *
 * Сервер уводит сюда с одноразовым кодом в адресе. Приложение перехватывает
 * этот https-адрес до загрузки (ASWebAuthenticationSession отдаёт его только
 * приложению с подтверждённым доменом). Если же адрес открылся в браузере —
 * поток начал не наш телефон, — код должен остаться здесь: страница без
 * скриптов, счётчиков и внешних ресурсов, с запретом Referer и кэша, иначе
 * адрес с кодом ушёл бы третьей стороне.
 */
export function GET() {
    const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>BURCEV</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5">
<h1 style="font-size:1.25rem">Вход в приложение BURCEV</h1>
<p>Вернитесь в приложение BURCEV на телефоне. Если вы не начинали вход из приложения, просто закройте эту страницу.</p>
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
