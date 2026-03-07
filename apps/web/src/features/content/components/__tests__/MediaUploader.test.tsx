import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MediaUploader } from '../MediaUploader'

jest.mock('@/shared/utils/token-storage', () => ({
    getToken: jest.fn(() => 'test-token'),
}))

describe('MediaUploader', () => {
    const onUpload = jest.fn()

    beforeEach(() => {
        jest.clearAllMocks()
        global.fetch = jest.fn()
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('renders file select and upload buttons', () => {
        render(<MediaUploader articleId="article-1" onUpload={onUpload} />)

        expect(screen.getByText('Выбрать файл')).toBeInTheDocument()
        expect(screen.getByText('Загрузить')).toBeInTheDocument()
        expect(screen.getByText('Загрузить изображение')).toBeInTheDocument()
    })

    it('disables upload button when no file selected', () => {
        render(<MediaUploader articleId="article-1" onUpload={onUpload} />)
        expect(screen.getByText('Загрузить')).toBeDisabled()
    })

    it('shows filename after file selection', () => {
        render(<MediaUploader articleId="article-1" onUpload={onUpload} />)

        const input = document.querySelector('input[type="file"]')!
        const file = new File(['image data'], 'photo.jpg', { type: 'image/jpeg' })

        fireEvent.change(input, { target: { files: [file] } })

        expect(screen.getByText('photo.jpg')).toBeInTheDocument()
    })

    it('uploads file and calls onUpload with returned URL', async () => {
        const mockUrl = 'https://storage.example.com/uploaded-image.jpg'
        ;(global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ data: { url: mockUrl } }),
        })

        render(<MediaUploader articleId="article-1" onUpload={onUpload} />)

        const input = document.querySelector('input[type="file"]')!
        const file = new File(['image data'], 'photo.jpg', { type: 'image/jpeg' })
        fireEvent.change(input, { target: { files: [file] } })

        fireEvent.click(screen.getByText('Загрузить'))

        await waitFor(() => {
            expect(onUpload).toHaveBeenCalledWith(mockUrl)
        })

        expect(global.fetch).toHaveBeenCalledWith(
            '/api/v1/content/articles/article-1/media',
            expect.objectContaining({
                method: 'POST',
                headers: { Authorization: 'Bearer test-token' },
            })
        )

        expect(screen.getByText(mockUrl)).toBeInTheDocument()
    })

    it('shows error on upload failure', async () => {
        ;(global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            json: () => Promise.resolve({ error: 'Upload failed' }),
        })

        render(<MediaUploader articleId="article-1" onUpload={onUpload} />)

        const input = document.querySelector('input[type="file"]')!
        const file = new File(['data'], 'bad.jpg', { type: 'image/jpeg' })
        fireEvent.change(input, { target: { files: [file] } })

        fireEvent.click(screen.getByText('Загрузить'))

        await waitFor(() => {
            expect(screen.getByText('Ошибка загрузки файла')).toBeInTheDocument()
        })

        expect(onUpload).not.toHaveBeenCalled()
    })

    it('shows loading state during upload', async () => {
        let resolveUpload: (value: unknown) => void
        ;(global.fetch as jest.Mock).mockReturnValue(
            new Promise((resolve) => { resolveUpload = resolve })
        )

        render(<MediaUploader articleId="article-1" onUpload={onUpload} />)

        const input = document.querySelector('input[type="file"]')!
        const file = new File(['data'], 'test.jpg', { type: 'image/jpeg' })
        fireEvent.change(input, { target: { files: [file] } })

        fireEvent.click(screen.getByText('Загрузить'))

        expect(screen.getByText('Загрузка...')).toBeInTheDocument()

        resolveUpload!({
            ok: true,
            json: () => Promise.resolve({ url: 'https://example.com/img.jpg' }),
        })

        await waitFor(() => {
            expect(screen.queryByText('Загрузка...')).not.toBeInTheDocument()
        })
    })

    it('accepts only image files', () => {
        render(<MediaUploader articleId="article-1" onUpload={onUpload} />)
        const input = document.querySelector('input[type="file"]')!
        expect(input).toHaveAttribute('accept', 'image/*')
    })
})
