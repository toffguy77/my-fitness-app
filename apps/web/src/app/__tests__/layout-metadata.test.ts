import { metadata } from '../layout'

// Права в Яндекс Вебмастере подтверждены записью DNS. Второй способ рядом
// ничего не добавляет, а мета-тег с чужим кодом после смены владельца
// кабинета стал бы ложным.
describe('root layout metadata', () => {
    it('does not carry a Webmaster verification tag', () => {
        expect(metadata.verification?.yandex).toBeUndefined()
        expect(metadata.verification?.other?.['yandex-verification']).toBeUndefined()
    })
})
