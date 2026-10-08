import type { ComponentType } from 'react'
import { render, screen } from '@testing-library/react'
import { ArticleContent, withoutRepeatedTitle } from '../ArticleContent'

// react-markdown is ESM and cannot load here. The stand-in keeps the text and
// hands back the heading override, so the page's choice of tags is still checked.
let markdownComponents: Record<string, ComponentType<{ children?: React.ReactNode }>> = {}
jest.mock('react-markdown', () => ({
    __esModule: true,
    default: ({
        children,
        components,
    }: {
        children: string
        components?: Record<string, ComponentType<{ children?: React.ReactNode }>>
    }) => {
        markdownComponents = components ?? {}
        return <div data-testid="markdown">{children}</div>
    },
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

    // Статьи пишутся с «# Заголовок» сверху, а страница уже печатает его:
    // читатель видел заголовок дважды, робот находил два h1.
    it('does not print the title a second time from the body', () => {
        render(
            <ArticleContent
                article={{ ...article, body: `# ${article.title}\n\n${article.body}` }}
                byline={null}
            />,
        )

        expect(screen.getByTestId('markdown').textContent).toBe(`\n${article.body}`)
    })

    it('renders any other first-level heading in the body as h2', () => {
        render(<ArticleContent article={article} byline={null} />)
        const Heading = markdownComponents.h1

        render(<Heading>Раздел</Heading>)

        expect(screen.getByRole('heading', { name: 'Раздел' }).tagName).toBe('H2')
    })
})

describe('withoutRepeatedTitle', () => {
    const title = 'Что такое КБЖУ?'

    it('drops a first heading equal to the title', () => {
        expect(withoutRepeatedTitle(`# ${title}\nТекст`, title)).toBe('Текст')
        expect(withoutRepeatedTitle(`\n  # ${title}  \r\nТекст`, title)).toBe('Текст')
    })

    it('keeps a first heading that says something else', () => {
        const body = '# Вступление\nТекст'
        expect(withoutRepeatedTitle(body, title)).toBe(body)
    })

    it('keeps the title when it is not a heading or not first', () => {
        expect(withoutRepeatedTitle(`${title}\nТекст`, title)).toBe(`${title}\nТекст`)
        expect(withoutRepeatedTitle(`Текст\n# ${title}`, title)).toBe(`Текст\n# ${title}`)
    })

    it('leaves a second-level heading alone', () => {
        expect(withoutRepeatedTitle(`## ${title}\nТекст`, title)).toBe(`## ${title}\nТекст`)
    })
})
