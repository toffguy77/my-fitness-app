/**
 * The proxy holds the whole end-to-end suite up, so it has to survive what a
 * browser does routinely: cancel a request mid-flight, reset a connection,
 * talk to an upstream that is not there.
 *
 * It did not. One ECONNRESET took the process down mid-run, and every
 * remaining test failed with a connection refused that said nothing about why.
 *
 * Run: node --test scripts/__tests__/dev-proxy.test.mjs
 */
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import { spawn } from 'node:child_process'
import test, { after, before } from 'node:test'

const PROXY_PORT = 3391
const WEB_PORT = 3392
const API_PORT = 3393

let proxy
let web
let api

/**
 * Sockets an upgrade left open. A server does not close these for you, and one
 * of them left behind keeps the test process alive after everything has
 * passed — which reads as a hang, not as a pass.
 */
const upgraded = new Set()

/** Waits until the proxy answers, or gives up. */
async function waitForProxy() {
    for (let attempt = 0; attempt < 50; attempt++) {
        try {
            await fetch(`http://127.0.0.1:${PROXY_PORT}/health`)
            return
        } catch {
            await new Promise((resolve) => setTimeout(resolve, 100))
        }
    }
    throw new Error('the proxy never came up')
}

before(async () => {
    api = http.createServer((request, response) => {
        response.setHeader('Set-Cookie', 'session_present=1; Path=/; HttpOnly; Secure; SameSite=Lax')
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({ from: 'api', path: request.url }))
    })
    // The chat connects to /ws, which routes here. Enough of an upgrade to
    // exercise the raw-socket path.
    api.on('upgrade', (request, socket) => {
        socket.on('error', () => {})
        upgraded.add(socket)
        socket.on('close', () => upgraded.delete(socket))
        socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
    })
    await new Promise((resolve) => api.listen(API_PORT, '127.0.0.1', resolve))

    web = http.createServer((request, response) => {
        response.setHeader('Content-Type', 'text/html')
        response.end('<html><body>from the web app</body></html>')
    })
    await new Promise((resolve) => web.listen(WEB_PORT, '127.0.0.1', resolve))

    proxy = spawn(process.execPath, ['scripts/dev-proxy.mjs'], {
        env: {
            ...process.env,
            PROXY_PORT: String(PROXY_PORT),
            PROXY_WEB: `http://127.0.0.1:${WEB_PORT}`,
            PROXY_API: `http://127.0.0.1:${API_PORT}`,
        },
        stdio: 'ignore',
    })
    await waitForProxy()
})

/** Closes a server without waiting for sockets an upgrade left open. */
async function shutDown(server) {
    if (!server) return
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
}

after(async () => {
    for (const socket of upgraded) socket.destroy()
    upgraded.clear()
    proxy?.kill('SIGKILL')
    await shutDown(api)
    await shutDown(web)
})

test('routes by path the way production does', async () => {
    const fromApi = await fetch(`http://127.0.0.1:${PROXY_PORT}/api/v1/auth/login`, { method: 'POST' })
    assert.equal((await fromApi.json()).from, 'api')

    const fromWeb = await fetch(`http://127.0.0.1:${PROXY_PORT}/dashboard`)
    assert.match(await fromWeb.text(), /from the web app/)
})

test('forwards Set-Cookie, which is the whole reason it exists', async () => {
    // A Next.js rewrite drops it. That is what made a cookie session work in
    // production and nowhere else.
    const response = await fetch(`http://127.0.0.1:${PROXY_PORT}/api/v1/auth/login`, { method: 'POST' })
    const cookies = response.headers.getSetCookie()
    assert.equal(cookies.length, 1)
    assert.match(cookies[0], /session_present=1/)
    assert.match(cookies[0], /HttpOnly/)
})

test('survives a client that resets the connection mid-body', async () => {
    // The exact shape that killed it: a request whose body the proxy is still
    // reading when the peer resets. A browser does this on every navigation
    // that cancels a request in flight.
    for (let attempt = 0; attempt < 5; attempt++) {
        const socket = net.connect(PROXY_PORT, '127.0.0.1')
        await new Promise((resolve) => socket.on('connect', resolve))
        socket.on('error', () => {})
        socket.write(
            'POST /api/v1/auth/login HTTP/1.1\r\n' +
                'Host: localhost\r\n' +
                'Content-Type: application/json\r\n' +
                'Content-Length: 400\r\n\r\n' +
                '{"email":"partial'
        )
        await new Promise((resolve) => setTimeout(resolve, 20))
        socket.resetAndDestroy()
        await new Promise((resolve) => setTimeout(resolve, 30))
    }

    const stillThere = await fetch(`http://127.0.0.1:${PROXY_PORT}/dashboard`)
    assert.equal(stillThere.status, 200, 'the proxy went down with the connection')
})

test('survives a WebSocket that is reset', async () => {
    // This is the shape that actually killed it. An upgrade hands the proxy a
    // raw socket, and a raw socket with no error listener turns an ordinary
    // reset into an unhandled 'error' event that ends the process. The chat
    // opens one of these on every page that has it, and closes it on every
    // navigation away.
    for (let attempt = 0; attempt < 3; attempt++) {
        const socket = net.connect(PROXY_PORT, '127.0.0.1')
        await new Promise((resolve) => socket.on('connect', resolve))
        socket.on('error', () => {})
        socket.write(
            'GET /ws HTTP/1.1\r\n' +
                'Host: localhost\r\n' +
                'Upgrade: websocket\r\n' +
                'Connection: Upgrade\r\n' +
                'Sec-WebSocket-Key: ' + Buffer.from('0123456789abcdef').toString('base64') + '\r\n' +
                'Sec-WebSocket-Version: 13\r\n\r\n'
        )
        await new Promise((resolve) => setTimeout(resolve, 120))
        socket.resetAndDestroy()
        await new Promise((resolve) => setTimeout(resolve, 80))
    }

    const stillThere = await fetch(`http://127.0.0.1:${PROXY_PORT}/dashboard`)
    assert.equal(stillThere.status, 200, 'the proxy went down with a reset WebSocket')
})

test('survives a malformed request', async () => {
    const socket = net.connect(PROXY_PORT, '127.0.0.1')
    await new Promise((resolve) => socket.on('connect', resolve))
    socket.write('this is not http at all\r\n\r\n')
    await new Promise((resolve) => setTimeout(resolve, 100))
    socket.destroy()

    const stillThere = await fetch(`http://127.0.0.1:${PROXY_PORT}/dashboard`)
    assert.equal(stillThere.status, 200)
})

test('answers 502 rather than dying when an upstream is gone', async () => {
    await shutDown(web)

    const response = await fetch(`http://127.0.0.1:${PROXY_PORT}/dashboard`)
    assert.equal(response.status, 502)
    assert.match(await response.text(), /could not reach/)

    // And the API side still works, so one dead upstream is not both.
    const fromApi = await fetch(`http://127.0.0.1:${PROXY_PORT}/api/v1/anything`)
    assert.equal(fromApi.status, 200)

    web = http.createServer((request, response) => response.end('<html>from the web app</html>'))
    await new Promise((resolve) => web.listen(WEB_PORT, '127.0.0.1', resolve))
})
