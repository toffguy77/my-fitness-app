/**
 * The Yandex ID stand-in the end-to-end suite registers through.
 *
 * What matters is what the API relies on: the authorize step hands the state
 * back untouched, the code turns into a token, and the token into a profile
 * for the very address the test asked for — and nobody else's.
 *
 * Run: node --test scripts/__tests__/oauth-stub.test.mjs
 */
import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import { createStub, profileIdFor } from '../oauth-stub.mjs'

let server
let base

before(async () => {
    server = createStub()
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${server.address().port}`
})

after(() => new Promise((resolve) => server.close(resolve)))

async function authorize(params) {
    const response = await fetch(`${base}/authorize?${new URLSearchParams(params)}`, { redirect: 'manual' })
    return response
}

async function signIn(loginHint) {
    const params = { redirect_uri: 'http://localhost:3070/api/v1/auth/oauth/yandex/callback', state: 'st-1' }
    if (loginHint) params.login_hint = loginHint
    const location = new URL((await authorize(params)).headers.get('location'))
    const code = location.searchParams.get('code')
    const tokenResponse = await fetch(`${base}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code }),
    })
    assert.equal(tokenResponse.status, 200)
    const { access_token: accessToken } = await tokenResponse.json()
    const profileResponse = await fetch(`${base}/info?format=json`, {
        headers: { Authorization: `OAuth ${accessToken}` },
    })
    assert.equal(profileResponse.status, 200)
    return { location, profile: await profileResponse.json() }
}

test('authorize returns to redirect_uri with a code and the same state', async () => {
    const response = await authorize({
        redirect_uri: 'http://localhost:3070/api/v1/auth/oauth/yandex/callback',
        state: 'abc',
        login_hint: 'e2e-oauth-1@burcev.test',
    })
    assert.equal(response.status, 302)
    const location = new URL(response.headers.get('location'))
    assert.equal(location.origin + location.pathname, 'http://localhost:3070/api/v1/auth/oauth/yandex/callback')
    assert.equal(location.searchParams.get('state'), 'abc')
    assert.ok(location.searchParams.get('code'))
})

test('authorize refuses a request without redirect_uri or state', async () => {
    assert.equal((await authorize({ state: 'abc' })).status, 400)
    assert.equal((await authorize({ redirect_uri: 'http://localhost:3070/cb' })).status, 400)
})

test('the profile is the address the test asked for, in Yandex shape', async () => {
    const { profile } = await signIn('e2e-oauth-chosen@burcev.test')
    assert.equal(profile.default_email, 'e2e-oauth-chosen@burcev.test')
    assert.equal(profile.id, profileIdFor('e2e-oauth-chosen@burcev.test'))
    assert.ok(profile.display_name)
    assert.equal(profile.is_avatar_empty, true)
})

test('the same address is the same Yandex user; another address is another', async () => {
    const first = await signIn('e2e-oauth-same@burcev.test')
    const again = await signIn('e2e-oauth-same@burcev.test')
    const other = await signIn('e2e-oauth-other@burcev.test')
    assert.equal(first.profile.id, again.profile.id)
    assert.notEqual(first.profile.id, other.profile.id)
})

test('without login_hint a fresh test address is made up', async () => {
    const one = await signIn()
    const two = await signIn()
    assert.match(one.profile.default_email, /^e2e-oauth-.+@burcev\.test$/)
    assert.notEqual(one.profile.default_email, two.profile.default_email)
})

test('token and info refuse what the stub did not issue', async () => {
    const token = await fetch(`${base}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code: 'not-a-code' }),
    })
    assert.equal(token.status, 400)
    assert.equal((await fetch(`${base}/info`)).status, 401)
    assert.equal((await fetch(`${base}/info`, { headers: { Authorization: 'OAuth nope' } })).status, 401)
})
