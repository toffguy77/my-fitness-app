import { render, screen } from '@testing-library/react'
import { BetaNotice } from '../BetaNotice'

describe('BetaNotice', () => {
    it('говорит, что раздел бесплатный пока, и зовёт в чат', () => {
        render(<BetaNotice />)
        const notice = screen.getByRole('complementary', { name: /Бета-версия/ })
        expect(notice).toHaveTextContent('пока он бесплатный для всех')
        expect(notice).toHaveTextContent('платную подписку')
        expect(screen.getByRole('link', { name: 'Написать в чат' })).toHaveAttribute('href', '/chat')
    })
})
