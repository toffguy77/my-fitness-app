import { render, screen } from '@testing-library/react'
import AuthorPage, { metadata } from '../avtor/sergey-burcev/page'

const articles = [
    { id: 'a1', slug: 'chto-takoe-kbzhu-i-zachem-ego-schitat', title: 'Что такое КБЖУ и зачем его считать?', excerpt: 'Коротко', category: 'nutrition', author_name: 'x' },
    { id: 'a2', slug: 'tvoya-pervaya-nedelya-poshagovyy-plan', title: 'Твоя первая неделя: пошаговый план', excerpt: 'План', category: 'general', author_name: 'x' },
]

function jsonLd(container: HTMLElement) {
    return Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map((s) =>
        JSON.parse(s.innerHTML),
    )
}

describe('the author page', () => {
    beforeEach(() => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: { articles, total: 2 } }),
        })
    })

    it('reads the article list afresh', async () => {
        await AuthorPage()

        expect(global.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ cache: 'no-store' }))
    })

    it('names the author and his qualification', async () => {
        render(await AuthorPage())

        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Сергей Бурцев')
        expect(
            screen.getByText('Спортивный практикующий тренер, мастер спорта по тяжёлой атлетике'),
        ).toBeInTheDocument()
    })

    it('links to his articles by their readable addresses', async () => {
        render(await AuthorPage())

        expect(screen.getByRole('link', { name: 'Что такое КБЖУ и зачем его считать?' })).toHaveAttribute(
            'href',
            '/content/chto-takoe-kbzhu-i-zachem-ego-schitat',
        )
        expect(screen.getByRole('link', { name: 'Твоя первая неделя: пошаговый план' })).toBeInTheDocument()
    })

    it('is marked up as a profile of a person', async () => {
        const { container } = render(await AuthorPage())

        const profile = jsonLd(container).find((b) => b['@type'] === 'ProfilePage')
        expect(profile.mainEntity['@type']).toBe('Person')
        expect(profile.mainEntity.name).toBe('Сергей Бурцев')
        expect(profile.mainEntity.url).toBe('https://burcev.team/avtor/sergey-burcev')
    })

    it('still renders when the article list cannot be fetched', async () => {
        ;(global.fetch as jest.Mock).mockRejectedValue(new Error('down'))

        render(await AuthorPage())

        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Сергей Бурцев')
    })

    it('names its own address as canonical and is open to search', () => {
        expect(metadata.alternates?.canonical).toBe('https://burcev.team/avtor/sergey-burcev')
        expect(metadata.robots).toBeUndefined()
    })
})
