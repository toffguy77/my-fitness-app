import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

jest.mock('../ArticleForm', () => ({
    ArticleForm: ({ onSave, onPublish, onSchedule, loading }: {
        onSave: (data: Record<string, unknown>) => void
        onPublish?: () => void
        onSchedule?: (date: string) => void
        loading?: boolean
    }) => (
        <div data-testid="article-form">
            <button onClick={() => onSave({ title: 'Test Title', category: 'general', audience_scope: 'all' })}>
                Save
            </button>
            {onPublish && <button onClick={onPublish}>Publish</button>}
            {onSchedule && <button onClick={() => onSchedule('2026-04-01T00:00:00.000Z')}>Schedule</button>}
            {loading && <span data-testid="form-loading">Loading</span>}
        </div>
    ),
}))

jest.mock('../FileUploader', () => ({
    FileUploader: ({ onFileLoaded }: { onFileLoaded: (content: string) => void }) => (
        <button data-testid="file-uploader" onClick={() => onFileLoaded('# Imported content')}>
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
            category: 'general',
            status: 'draft',
            audience_scope: 'all',
            author_id: 1,
            author_name: 'Author',
            excerpt: '',
            created_at: '2026-01-01',
            updated_at: '2026-01-01',
        }
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

    it('shows markdown preview when content is entered', async () => {
        const user = userEvent.setup()
        render(<ArticleEditor />)

        const textarea = screen.getByPlaceholderText('Напишите статью в формате Markdown...')
        await user.type(textarea, '# Test')

        expect(screen.getByTestId('markdown-preview')).toHaveTextContent('# Test')
    })

    it('shows empty preview message when no content', () => {
        render(<ArticleEditor />)
        expect(screen.getByText('Начните писать, чтобы увидеть превью')).toBeInTheDocument()
    })

    it('creates new article on save', async () => {
        mockContentApi.createArticle.mockResolvedValue({ id: 'new-1', title: 'Test Title' })

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
            category: 'general',
            status: 'draft',
            audience_scope: 'all',
            author_id: 1,
            author_name: 'Author',
            excerpt: '',
            created_at: '2026-01-01',
            updated_at: '2026-01-01',
        }
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
            category: 'general',
            status: 'draft',
            audience_scope: 'all',
            author_id: 1,
            author_name: 'Author',
            excerpt: '',
            created_at: '2026-01-01',
            updated_at: '2026-01-01',
        }
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
            category: 'general',
            status: 'draft',
            audience_scope: 'all',
            author_id: 1,
            author_name: 'Author',
            excerpt: '',
            created_at: '2026-01-01',
            updated_at: '2026-01-01',
        }
        mockContentApi.getArticle.mockResolvedValue(article)

        render(<ArticleEditor articleId="article-1" />)

        await waitFor(() => {
            expect(screen.getByTestId('media-uploader')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByTestId('media-uploader'))

        const textarea = screen.getByPlaceholderText('Напишите статью в формате Markdown...')
        expect(textarea.getAttribute('value') || (textarea as HTMLTextAreaElement).value).toContain('https://example.com/image.jpg')
    })

    it('toggles between editor and preview tabs on mobile', () => {
        render(<ArticleEditor />)

        const editorTab = screen.getByText('Редактор')
        const previewTabs = screen.getAllByText('Превью')

        expect(editorTab).toBeInTheDocument()
        expect(previewTabs.length).toBeGreaterThanOrEqual(1)

        fireEvent.click(previewTabs[0])
        fireEvent.click(editorTab)
    })

    it('applies toolbar actions', () => {
        render(<ArticleEditor />)

        const textarea = screen.getByPlaceholderText('Напишите статью в формате Markdown...')
        fireEvent.change(textarea, { target: { value: '' } })

        fireEvent.click(screen.getByTitle('Жирный'))
        expect((textarea as HTMLTextAreaElement).value).toContain('**')
    })
})
