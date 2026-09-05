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
const WEB = process.env.PROXY_WEB || 'http://127.0.0.1:3069'
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

const server = http.createServer((clientRequest, clientResponse) => {
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
        clientResponse.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
        clientResponse.end(`proxy could not reach ${upstream.origin}: ${error.message}`)
    })

    clientRequest.pipe(proxied)
})

// WebSockets: the chat connects to /ws, which Traefik also sends to the API.
server.on('upgrade', (request, socket, head) => {
    const upstream = target(request.url)

    const proxied = http.request({
        hostname: upstream.hostname,
        port: upstream.port,
        path: request.url,
        method: 'GET',
        headers: { ...request.headers, host: upstream.host },
    })

    proxied.on('upgrade', (upstreamResponse, upstreamSocket, upstreamHead) => {
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

server.listen(PORT, () => {
    console.log(`proxy on http://localhost:${PORT} — /api/v1, /ws, /health, /ready → ${API}, the rest → ${WEB}`)
})
