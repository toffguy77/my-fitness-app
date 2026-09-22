#!/usr/bin/env node
/**
 * One origin in front of the web app and the API, the way production has one.
 *
 * In production Traefik routes by path: `/api/v1`, `/ws`, `/health` and
 * `/ready` go straight to the API, everything else to Next. Locally and under
 * test there is no Traefik, so the browser talked to Next for everything and
 * Next proxied `/api` onwards through its `rewrites`.
 *
 * That difference was invisible until the session moved into a cookie:
 * **a Next.js rewrite does not forward `Set-Cookie`**. Measured, not assumed —
 * no cookie of any shape survives it. So every sign-in worked in production and
 * silently established no session anywhere else, including in the end-to-end
 * suite that exists to catch exactly this.
 *
 * This proxy makes the test and development environments route the way the
 * real one does. It is deliberately dull: no rewriting, no buffering, no
 * opinions — just the same path rules Traefik has.
 */
import http from 'node:http'

const PORT = Number(process.env.PROXY_PORT || 3070)
// Порт фронтенда — из той же переменной, что и у самого фронтенда
// (apps/web/package.json). Раньше он был зашит здесь числом, а в скрипте
// запуска — своим: заняв 3069 чужим стендом, `npm run start` падал, а прокси
// продолжал слать на 3069 и отдавал браузеру чужое приложение. Ни отказа, ни
// предупреждения — страницы отдавались, просто не те.
const WEB_PORT = Number(process.env.WEB_PORT || 3069)
const WEB = process.env.PROXY_WEB || `http://127.0.0.1:${WEB_PORT}`
const API = process.env.PROXY_API || 'http://127.0.0.1:4000'

/** The paths Traefik hands to the API. Everything else belongs to the web app. */
function goesToTheApi(path) {
    return (
        path.startsWith('/api/v1') ||
        path === '/ws' ||
        path.startsWith('/ws?') ||
        path === '/health' ||
        path === '/ready' ||
        path === '/metrics'
    )
}

function target(path) {
    return new URL(goesToTheApi(path) ? API : WEB)
}

/**
 * A connection going away is ordinary — a browser cancels a pending request on
 * every navigation. Without a listener Node turns that into an unhandled
 * 'error' event and takes the process down, which is what happened: the proxy
 * died mid-run and every remaining test failed with a connection refused that
 * said nothing about why.
 */
function ignoreDisconnects(...streams) {
    for (const stream of streams) {
        stream?.on?.('error', () => {})
    }
}

const server = http.createServer((clientRequest, clientResponse) => {
    ignoreDisconnects(clientRequest, clientResponse)
    const upstream = target(clientRequest.url)

    const proxied = http.request(
        {
            hostname: upstream.hostname,
            port: upstream.port,
            path: clientRequest.url,
            method: clientRequest.method,
            headers: { ...clientRequest.headers, host: upstream.host },
        },
        (upstreamResponse) => {
            // Every header, verbatim — Set-Cookie included. Forwarding all of
            // them is the entire point of this file.
            clientResponse.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
            upstreamResponse.pipe(clientResponse)
        }
    )

    proxied.on('error', (error) => {
        if (clientResponse.headersSent || clientResponse.destroyed) {
            clientResponse.destroy()
            return
        }
        clientResponse.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
        clientResponse.end(`proxy could not reach ${upstream.origin}: ${error.message}`)
    })

    clientRequest.pipe(proxied)
})

// WebSockets: the chat connects to /ws, which Traefik also sends to the API.
server.on('upgrade', (request, socket, head) => {
    ignoreDisconnects(request, socket)
    const upstream = target(request.url)

    const proxied = http.request({
        hostname: upstream.hostname,
        port: upstream.port,
        path: request.url,
        method: 'GET',
        headers: { ...request.headers, host: upstream.host },
    })

    proxied.on('upgrade', (upstreamResponse, upstreamSocket, upstreamHead) => {
        ignoreDisconnects(upstreamSocket)
        const headers = Object.entries(upstreamResponse.headers)
            .map(([name, value]) => `${name}: ${value}\r\n`)
            .join('')
        socket.write(`HTTP/1.1 101 Switching Protocols\r\n${headers}\r\n`)
        if (upstreamHead?.length) socket.unshift(upstreamHead)
        upstreamSocket.pipe(socket)
        socket.pipe(upstreamSocket)
    })

    proxied.on('error', () => socket.destroy())
    if (head?.length) proxied.write(head)
    proxied.end()
})

// A malformed or reset connection that never becomes a request reaches here
// rather than the request handler.
server.on('clientError', (error, socket) => {
    if (!socket.destroyed) socket.destroy()
})

// Last line of defence. The proxy holding the whole suite up must not be the
// thing that ends it; anything unexpected is reported and survived.
process.on('uncaughtException', (error) => {
    console.error('proxy survived an unexpected error:', error)
})

/**
 * Убеждается, что по адресу WEB стоит именно наш фронтенд.
 *
 * Проверяется метка `x-burcev-web`, которую ставит apps/web/next.config.ts.
 * Без этой проверки прокси отдавал браузеру что угодно, слушающее нужный
 * порт: `npm run start`, не сумевший занять порт, умирал, а на том же порту
 * оставался фронтенд из соседнего рабочего каталога — запущенный неделю
 * назад, собранный с другими настройками. Ни отказа, ни предупреждения:
 * страницы отдавались, тесты падали на «элемент не найден», и выглядело это
 * как сломанный продукт.
 *
 * Отказ здесь громкий и с объяснением — это дешевле часа поисков.
 */
async function verifyWebTarget() {
    let response
    try {
        response = await fetch(WEB, { method: 'HEAD', redirect: 'manual' })
    } catch (error) {
        console.error(
            `прокси не стартует: по адресу ${WEB} никто не отвечает (${error.code || error.message}).\n` +
                `Фронтенд не поднят или занял другой порт — задайте WEB_PORT и запустите его им же.`,
        )
        process.exit(1)
    }
    if (!response.headers.get('x-burcev-web')) {
        console.error(
            `прокси не стартует: по адресу ${WEB} отвечает не приложение BURCEV.\n` +
                `Нет метки x-burcev-web — скорее всего порт занят чужим стендом, а наш\n` +
                `фронтенд не поднялся. Задайте WEB_PORT свободным портом и запустите\n` +
                `фронтенд им же: WEB_PORT=<порт> npm run start --workspace=apps/web`,
        )
        process.exit(1)
    }
}

await verifyWebTarget()

server.listen(PORT, () => {
    console.log(`proxy on http://localhost:${PORT} — /api/v1, /ws, /health, /ready → ${API}, the rest → ${WEB}`)
})
