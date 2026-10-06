import { render, screen } from '@testing-library/react'
import { ArticleContent } from '../ArticleContent'

jest.mock('react-markdown', () => ({
    __esModule: true,
    default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}))
jest.mock('remark-gfm', () => ({ __esModule: true, default: jest.fn() }))

const article = {
    title: 'Что такое КБЖУ и зачем его считать?',
    category: 'nutrition' as const,
    published_at: '2026-03-08T08:20:26Z',
    body: 'КБЖУ — это калории, белки, жиры и углеводы.',
}

describe('ArticleContent', () => {
    it('lays out the category, the title, the byline, the date and the body', () => {
        render(<ArticleContent article={article} byline={<span>Подпись</span>} />)

        expect(screen.getByText('Питание')).toBeInTheDocument()
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(article.title)
        expect(screen.getByText('Подпись')).toBeInTheDocument()
        expect(screen.getByText('8 марта 2026 г.')).toBeInTheDocument()
        expect(screen.getByTestId('markdown')).toHaveTextContent(article.body)
    })

    it('puts what follows after the body', () => {
        const { container } = render(
            <ArticleContent article={article} byline={null}>
                <p>После статьи</p>
            </ArticleContent>,
        )

        const markdown = screen.getByTestId('markdown')
        const after = screen.getByText('После статьи')
        expect(markdown.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(container.querySelector('a[href="/content"]')).toBeInTheDocument()
    })

    it('still renders what follows when the article has no body', () => {
        render(
            <ArticleContent article={{ ...article, body: undefined }} byline={null}>
                <p>После статьи</p>
            </ArticleContent>,
        )

        expect(screen.getByText('После статьи')).toBeInTheDocument()
    })
})
