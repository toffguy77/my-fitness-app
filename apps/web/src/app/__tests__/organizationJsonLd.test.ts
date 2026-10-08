import { organizationJsonLd } from '../organizationJsonLd'

describe('Organization на посадочной', () => {
    it('называет бота поддержки контактом и профилем', () => {
        const data = organizationJsonLd('burcevteam_bot')

        expect(data.contactPoint).toEqual(
            expect.objectContaining({ url: 'https://t.me/burcevteam_bot', email: 'support@burcev.team' }),
        )
        expect(data.sameAs).toEqual(['https://t.me/burcevteam_bot'])
    })

    // Без бота в развёртывании ссылка вела бы в никуда — её просто нет.
    it('без бота обходится почтой', () => {
        const data = organizationJsonLd('')

        expect(data.contactPoint).not.toHaveProperty('url')
        expect(data).not.toHaveProperty('sameAs')
        expect(data.contactPoint.email).toBe('support@burcev.team')
    })

    it('даёт растровый логотип', () => {
        expect(organizationJsonLd('x').logo).toMatch(/\.png$/)
    })
})
