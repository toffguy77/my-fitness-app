import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Article } from '@/features/content/types'
import { ArticleEditor } from '../ArticleEditor'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush }),
}))

jest.mock('react-markdown', () => ({
    __esModule: true,
    default: ({ children }: { children: string }) => <div data-testid="markdown-preview">{children}</div>,
}))

jest.mock('remark-gfm', () => ({
    __esModule: true,
    default: () => {},
}))

jest.mock('@/features/content/api/contentApi', () => ({
    contentApi: {
        getArticle: jest.fn(),
        createArticle: jest.fn(),
        updateArticle: jest.fn(),
        publishArticle: jest.fn(),
        scheduleArticle: jest.fn(),
    },
}))

import { contentApi } from '@/features/content/api/contentApi'

const mockContentApi = contentApi as jest.Mocked<typeof contentApi>

const DRAFT_COVER = 'https://storage.yandexcloud.net/curator-content/cover-images/draft.jpg'

jest.mock('../ArticleForm', () => ({
    ArticleForm: ({ onSave, onPublish, onSchedule, onDraftChange, loading }: {
        onSave: (data: Record<string, unknown>) => void
        onPublish?: () => void
        onSchedule?: (date: string) => void
        onDraftChange?: (draft: Record<string, unknown>) => void
        loading?: boolean
    }) => (
        <div data-testid="article-form">
            <button
                onClick={() => onDraftChange?.({
                    title: 'Заголовок из формы',
                    category: 'nutrition',
                    cover_image_url: DRAFT_COVER,
                    audience_scope: 'my_clients',
                })}
            >
                Draft
            </button>
            <button onClick={() => onSave({ title: 'Test Title', category: 'general', audience_scope: 'all' })}>
                Save
            </button>
            {onPublish && <button onClick={onPublish}>Publish</button>}
            {onSchedule && <button onClick={() => onSchedule('2026-04-01T00:00:00.000Z')}>Schedule</button>}
            {loading && <span data-testid="form-loading">Loading</span>}
        </div>
    ),
}))

jest.mock('next/image', () => ({
    __esModule: true,
    default: (props: React.ComponentProps<'img'> & { fill?: boolean; unoptimized?: boolean; priority?: boolean }) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { fill, unoptimized, priority, ...imgProps } = props
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
        return <img {...imgProps} />
    },
}))

jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ href, children, ...props }: React.ComponentProps<'a'>) => <a href={href} {...props}>{children}</a>,
}))

jest.mock('../ArticleAuthor', () => ({
    ArticleAuthor: () => <span>Эксперт BURCEV</span>,
}))

jest.mock('../FileUploader', () => ({
    FileUploader: ({ onFileLoaded }: { onFileLoaded: (parsed: { body: string; title?: string }) => void }) => (
        <button data-testid="file-uploader" onClick={() => onFileLoaded({ body: '# Imported content', title: 'Imported' })}>
            Import
        </button>
    ),
}))

jest.mock('../MediaUploader', () => ({
    MediaUploader: ({ onUpload }: { onUpload: (url: string) => void }) => (
        <button data-testid="media-uploader" onClick={() => onUpload('https://example.com/image.jpg')}>
            Upload Media
        </button>
    ),
}))

describe('ArticleEditor', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('renders editor with textarea and toolbar', () => {
        render(<ArticleEditor />)

        expect(screen.getByPlaceholderText('Напишите статью в формате Markdown...')).toBeInTheDocument()
        expect(screen.getByTitle('Жирный')).toBeInTheDocument()
        expect(screen.getByTitle('Курсив')).toBeInTheDocument()
        expect(screen.getByTitle('Заголовок')).toBeInTheDocument()
    })

    it('renders article form', () => {
        render(<ArticleEditor />)
        expect(screen.getByTestId('article-form')).toBeInTheDocument()
    })

    it('shows loading spinner when fetching article', () => {
        mockContentApi.getArticle.mockImplementation(() => new Promise(() => {}))
        const { container } = render(<ArticleEditor articleId="article-1" />)
        const spinner = container.querySelector('svg.animate-spin') || container.querySelector('.animate-spin')
        expect(spinner).toBeTruthy()
    })

    it('loads article data for editing', async () => {
        const article = {
            id: 'article-1',
            title: 'Test Article',
            body: '# Hello',
            category: 'general' as const,
            status: 'draft' as const,
            audience_scope: 'all' as const,
            author_id: 1,
            author_name: 'Author',
            excerpt: '',
            created_at: '2026-01-01',
            updated_at: '2026-01-01',
        } as Article
        mockContentApi.getArticle.mockResolvedValue(article)

        render(<ArticleEditor articleId="article-1" />)

        await waitFor(() => {
            expect(screen.getByDisplayValue('# Hello')).toBeInTheDocument()
        })
    })

    it('shows error when article fetch fails', async () => {
        mockContentApi.getArticle.mockRejectedValue(new Error('Not found'))

        render(<ArticleEditor articleId="article-1" />)

        await waitFor(() => {
            expect(screen.getByText('Not found')).toBeInTheDocument()
        })
    })

    it('updates body text when typing in textarea', async () => {
        const user = userEvent.setup()
        render(<ArticleEditor />)

        const textarea = screen.getByPlaceholderText('Напишите статью в формате Markdown...')
        await user.type(textarea, 'Hello world')

        expect(textarea).toHaveValue('Hello world')
    })

    // Текст и превью стояли двумя узкими колонками: поле в 24 строки со своей
    // прокруткой рядом с превью другого размера. Теперь — вкладки на всю
    // ширину, и превью — та же страница статьи, что увидит читатель.
    describe('text and preview tabs', () => {
        it('opens on the text, with the preview hidden', () => {
            render(<ArticleEditor />)

            expect(screen.getByRole('tab', { name: 'Текст' })).toHaveAttribute('aria-selected', 'true')
            expect(screen.getByPlaceholderText('Напишите статью в формате Markdown...')).toBeVisible()
            expect(screen.queryByTestId('markdown-preview')).not.toBeInTheDocument()
        })

        it('shows the article as the reader will see it', async () => {
            const user = userEvent.setup()
            render(<ArticleEditor />)

            await user.type(screen.getByPlaceholderText('Напишите статью в формате Markdown...'), 'Текст статьи')
            fireEvent.click(screen.getByText('Draft'))
            fireEvent.click(screen.getByRole('tab', { name: 'Превью' }))

            expect(screen.getByRole('tab', { name: 'Превью' })).toHaveAttribute('aria-selected', 'true')
            expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Заголовок из формы')
            expect(screen.getByRole('img', { name: 'Заголовок из формы' })).toHaveAttribute('src', DRAFT_COVER)
            expect(screen.getByTestId('markdown-preview')).toHaveTextContent('Текст статьи')
            expect(screen.queryByPlaceholderText('Напишите статью в формате Markdown...')).not.toBeVisible()
        })

        // «Назад» в превью увёл бы со страницы и унёс несохранённый текст.
        it('has no way out of the editor inside the preview', () => {
            render(<ArticleEditor />)

            fireEvent.click(screen.getByRole('tab', { name: 'Превью' }))

            expect(screen.queryByRole('link', { name: /Назад/ })).not.toBeInTheDocument()
        })

        it('signs an article for everyone with the expert, as the public page does', () => {
            render(<ArticleEditor />)

            fireEvent.click(screen.getByRole('tab', { name: 'Превью' }))

            expect(screen.getByText('Эксперт BURCEV')).toBeInTheDocument()
        })
    })

    it('creates new article on save', async () => {
        mockContentApi.createArticle.mockResolvedValue({ id: 'new-1', title: 'Test Title' } as Article)

        render(<ArticleEditor />)
        fireEvent.click(screen.getByText('Save'))

        await waitFor(() => {
            expect(mockContentApi.createArticle).toHaveBeenCalled()
        })
    })

    it('updates existing article on save', async () => {
        const article = {
            id: 'article-1',
            title: 'Existing',
            body: 'content',
            category: 'general' as const,
            status: 'draft' as const,
            audience_scope: 'all' as const,
            author_id: 1,
            author_name: 'Author',
            excerpt: '',
            created_at: '2026-01-01',
            updated_at: '2026-01-01',
        } as Article
        mockContentApi.getArticle.mockResolvedValue(article)
        mockContentApi.updateArticle.mockResolvedValue(article)

        render(<ArticleEditor articleId="article-1" />)

        await waitFor(() => {
            expect(screen.getByText('Publish')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByText('Save'))

        await waitFor(() => {
            expect(mockContentApi.updateArticle).toHaveBeenCalled()
        })
    })

    it('publishes article', async () => {
        const article = {
            id: 'article-1',
            title: 'Draft',
            body: 'text',
            category: 'general' as const,
            status: 'draft' as const,
            audience_scope: 'all' as const,
            author_id: 1,
            author_name: 'Author',
            excerpt: '',
            created_at: '2026-01-01',
            updated_at: '2026-01-01',
        } as Article
        mockContentApi.getArticle.mockResolvedValue(article)
        mockContentApi.updateArticle.mockResolvedValue(article)
        mockContentApi.publishArticle.mockResolvedValue(undefined)

        render(<ArticleEditor articleId="article-1" returnPath="/curator/content" />)

        await waitFor(() => {
            expect(screen.getByText('Publish')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByText('Publish'))

        await waitFor(() => {
            expect(mockContentApi.publishArticle).toHaveBeenCalledWith('article-1')
            expect(mockPush).toHaveBeenCalledWith('/curator/content')
        })
    })

    it('handles file import', () => {
        render(<ArticleEditor />)
        fireEvent.click(screen.getByTestId('file-uploader'))

        const textarea = screen.getByPlaceholderText('Напишите статью в формате Markdown...')
        expect(textarea).toHaveValue('# Imported content')
    })

    it('handles media upload by appending image markdown', async () => {
        const article = {
            id: 'article-1',
            title: 'Test',
            body: 'existing content',
            category: 'general' as const,
            status: 'draft' as const,
            audience_scope: 'all' as const,
            author_id: 1,
            author_name: 'Author',
            excerpt: '',
            created_at: '2026-01-01',
            updated_at: '2026-01-01',
        } as Article
        mockContentApi.getArticle.mockResolvedValue(article)

        render(<ArticleEditor articleId="article-1" />)

        await waitFor(() => {
            expect(screen.getByTestId('media-uploader')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByTestId('media-uploader'))

        const textarea = screen.getByPlaceholderText('Напишите статью в формате Markdown...')
        expect(textarea.getAttribute('value') || (textarea as HTMLTextAreaElement).value).toContain('https://example.com/image.jpg')
    })

    it('applies toolbar actions', () => {
        render(<ArticleEditor />)

        const textarea = screen.getByPlaceholderText('Напишите статью в формате Markdown...')
        fireEvent.change(textarea, { target: { value: '' } })

        fireEvent.click(screen.getByTitle('Жирный'))
        expect((textarea as HTMLTextAreaElement).value).toContain('**')
    })
})
