/**
 * @jest-environment node
 */
/**
 * Экран «Меню» требует аккаунта: гость с /menu уходит на вход и возвращается
 * туда, куда шёл.
 */
import { NextRequest } from 'next/server'
import { proxy } from '../proxy'

function guest(path: string): NextRequest {
    return new NextRequest(new URL(path, 'http://localhost:3070'))
}

function signedIn(path: string): NextRequest {
    const request = guest(path)
    request.cookies.set('session_present', '1')
    return request
}

describe('proxy: экраны, требующие аккаунта', () => {
    it.each(['/menu', '/menu/recipes/0f8b6c1e-2d0a-4f43-9a51-1b2c3d4e5f60'])(
        'гость с %s уходит на вход',
        async (path) => {
            const response = await proxy(guest(path))
            expect(response.status).toBe(307)
            const location = new URL(response.headers.get('location')!)
            expect(location.pathname).toBe('/auth')
            expect(location.searchParams.get('next')).toBe(path)
        },
    )

    it('вошедший с /menu проходит к странице', async () => {
        const response = await proxy(signedIn('/menu'))
        expect(response.headers.get('location')).toBeNull()
    })

    it('похожий адрес без границы сегмента не считается защищённым', async () => {
        const response = await proxy(guest('/menus'))
        expect(response.headers.get('location')).toBeNull()
    })
})
