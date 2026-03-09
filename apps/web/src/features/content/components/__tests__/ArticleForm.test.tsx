import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArticleForm } from '../ArticleForm'
import type { Article } from '@/features/content/types'

jest.mock('../AudienceSelector', () => ({
    AudienceSelector: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
        <select
            data-testid="audience-selector"
            value={value}
            onChange={(e) => onChange(e.target.value)}
        >
            <option value="all">Все</option>
            <option value="my_clients">Мои клиенты</option>
            <option value="selected">Выбранные</option>
        </select>
    ),
}))

const baseArticle: Article = {
    id: 'article-1',
    author_id: 1,
    author_name: 'Author',
    title: 'Test Title',
    excerpt: 'Short description',
    category: 'nutrition',
    status: 'draft',
    audience_scope: 'all',
    cover_image_url: 'https://example.com/cover.jpg',
    is_own: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
}

describe('ArticleForm', () => {
    const onSave = jest.fn()
    const onPublish = jest.fn()
    const onSchedule = jest.fn()

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('renders all form fields', () => {
        render(<ArticleForm onSave={onSave} />)

        expect(screen.getByLabelText(/Заголовок/)).toBeInTheDocument()
        expect(screen.getByLabelText('Краткое описание')).toBeInTheDocument()
        expect(screen.getByLabelText('Категория')).toBeInTheDocument()
        expect(screen.getByLabelText('URL обложки')).toBeInTheDocument()
    })

    it('populates fields from article prop', () => {
        render(<ArticleForm article={baseArticle} onSave={onSave} />)

        expect(screen.getByLabelText(/Заголовок/)).toHaveValue('Test Title')
        expect(screen.getByLabelText('Краткое описание')).toHaveValue('Short description')
        expect(screen.getByLabelText('Категория')).toHaveValue('nutrition')
        expect(screen.getByLabelText('URL обложки')).toHaveValue('https://example.com/cover.jpg')
    })

    it('calls onSave with create data for new article', async () => {
        const user = userEvent.setup()
        render(<ArticleForm onSave={onSave} />)

        await user.type(screen.getByLabelText(/Заголовок/), 'New Article')
        await user.type(screen.getByLabelText('Краткое описание'), 'Description')
        await user.type(screen.getByLabelText('URL обложки'), 'https://example.com/img.jpg')

        fireEvent.click(screen.getByText('Сохранить черновик'))

        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'New Article',
                excerpt: 'Description',
                category: 'general',
                audience_scope: 'all',
                cover_image_url: 'https://example.com/img.jpg',
            })
        )
    })

    it('calls onSave with update data for existing article', () => {
        render(<ArticleForm article={baseArticle} onSave={onSave} />)

        fireEvent.click(screen.getByText('Сохранить черновик'))

        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Test Title',
                category: 'nutrition',
            })
        )
    })

    it('disables save button when title is empty', () => {
        render(<ArticleForm onSave={onSave} />)
        expect(screen.getByText('Сохранить черновик')).toBeDisabled()
    })

    it('does not call onSave when title is whitespace only', async () => {
        const user = userEvent.setup()
        render(<ArticleForm onSave={onSave} />)

        await user.type(screen.getByLabelText(/Заголовок/), '   ')
        fireEvent.click(screen.getByText('Сохранить черновик'))

        expect(onSave).not.toHaveBeenCalled()
    })

    it('shows publish button for existing draft articles', () => {
        render(<ArticleForm article={baseArticle} onSave={onSave} onPublish={onPublish} />)
        expect(screen.getByText('Опубликовать')).toBeInTheDocument()
    })

    it('does not show publish button for new articles', () => {
        render(<ArticleForm onSave={onSave} onPublish={onPublish} />)
        expect(screen.queryByText('Опубликовать')).not.toBeInTheDocument()
    })

    it('calls onPublish when publish button clicked', () => {
        render(<ArticleForm article={baseArticle} onSave={onSave} onPublish={onPublish} />)
        fireEvent.click(screen.getByText('Опубликовать'))
        expect(onPublish).toHaveBeenCalled()
    })

    it('shows schedule input for drafts', () => {
        render(
            <ArticleForm article={baseArticle} onSave={onSave} onSchedule={onSchedule} />
        )
        expect(screen.getByLabelText('Запланировать публикацию')).toBeInTheDocument()
    })

    it('shows schedule button when datetime is set', async () => {
        render(
            <ArticleForm article={baseArticle} onSave={onSave} onSchedule={onSchedule} />
        )

        fireEvent.change(screen.getByLabelText('Запланировать публикацию'), {
            target: { value: '2026-04-01T12:00' },
        })

        expect(screen.getByText('Запланировать')).toBeInTheDocument()
    })

    it('calls onSchedule with ISO date', async () => {
        render(
            <ArticleForm article={baseArticle} onSave={onSave} onSchedule={onSchedule} />
        )

        fireEvent.change(screen.getByLabelText('Запланировать публикацию'), {
            target: { value: '2026-04-01T12:00' },
        })

        fireEvent.click(screen.getByText('Запланировать'))
        expect(onSchedule).toHaveBeenCalled()
    })

    it('shows loading text on save button when loading', () => {
        render(<ArticleForm article={baseArticle} onSave={onSave} loading={true} />)
        expect(screen.getByText('Сохранение...')).toBeInTheDocument()
    })

    it('disables buttons when loading', () => {
        render(
            <ArticleForm
                article={baseArticle}
                onSave={onSave}
                onPublish={onPublish}
                loading={true}
            />
        )
        expect(screen.getByText('Сохранение...')).toBeDisabled()
        expect(screen.getByText('Опубликовать')).toBeDisabled()
    })

    it('changes category via select', () => {
        render(<ArticleForm onSave={onSave} />)
        const select = screen.getByLabelText('Категория')
        fireEvent.change(select, { target: { value: 'training' } })
        expect(select).toHaveValue('training')
    })

    it('hides schedule section for published articles', () => {
        const publishedArticle = { ...baseArticle, status: 'published' as const }
        render(<ArticleForm article={publishedArticle} onSave={onSave} onSchedule={onSchedule} />)
        expect(screen.queryByLabelText('Запланировать публикацию')).not.toBeInTheDocument()
    })
})
