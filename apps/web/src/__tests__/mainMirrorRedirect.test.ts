/**
 * www.burcev.team отвечал 200 той же страницей. Главное зеркало Яндекс
 * выбирает по 301, а не по canonical, так что копия оставалась кандидатом.
 */
import { mainMirrorRedirect } from '../proxy'

describe('главное зеркало', () => {
    it('с www уводит на адрес без www, сохраняя путь и параметры', () => {
        expect(mainMirrorRedirect('www.burcev.team', '/pricing?utm_source=vk'))
            .toBe('https://burcev.team/pricing?utm_source=vk')
    })

    it('регистр в имени хоста не мешает', () => {
        expect(mainMirrorRedirect('WWW.Burcev.Team', '/')).toBe('https://burcev.team/')
    })

    it('главное зеркало, стенд и localhost не трогает', () => {
        for (const host of ['burcev.team', 'new.burcev.team', 'localhost:3070', null]) {
            expect(mainMirrorRedirect(host, '/')).toBeNull()
        }
    })
})
