import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhotoUploader } from '../PhotoUploader'

function createMockFile(name = 'photo.png', type = 'image/png'): File {
    return new File(['file-contents'], name, { type })
}

describe('PhotoUploader', () => {
    const defaultProps = {
        onUpload: jest.fn().mockResolvedValue('https://example.com/avatar.jpg'),
    }

    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('renders the initial placeholder when no avatarUrl is provided', () => {
        render(<PhotoUploader {...defaultProps} userName="Alice" />)

        expect(screen.getByText('A')).toBeInTheDocument()
        expect(screen.getByText('Сделать или выбрать фото')).toBeInTheDocument()
    })

    it('renders the user initial from userName', () => {
        render(<PhotoUploader {...defaultProps} userName="Bob" />)

        expect(screen.getByText('B')).toBeInTheDocument()
    })

    it('renders "?" when no userName is provided', () => {
        render(<PhotoUploader {...defaultProps} />)

        expect(screen.getByText('?')).toBeInTheDocument()
    })

    it('renders the avatar image when avatarUrl is provided', () => {
        render(
            <PhotoUploader
                {...defaultProps}
                avatarUrl="https://example.com/avatar.jpg"
                userName="Alice"
            />
        )

        const img = screen.getByRole('img', { name: 'Alice' })
        expect(img).toBeInTheDocument()
        expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg')
    })

    it('uses "Avatar" as alt text when userName is not provided', () => {
        render(
            <PhotoUploader
                {...defaultProps}
                avatarUrl="https://example.com/avatar.jpg"
            />
        )

        expect(screen.getByRole('img', { name: 'Avatar' })).toBeInTheDocument()
    })

    it('opens the file picker when the upload button is clicked', async () => {
        const user = userEvent.setup()
        render(<PhotoUploader {...defaultProps} />)

        const fileInput = screen.getByLabelText('Выбрать фото')
        const clickSpy = jest.spyOn(fileInput, 'click')

        await user.click(screen.getByText('Сделать или выбрать фото'))

        expect(clickSpy).toHaveBeenCalled()
        clickSpy.mockRestore()
    })

    it('calls onUpload with the selected file', async () => {
        const user = userEvent.setup()
        const onUpload = jest.fn().mockResolvedValue('url')

        render(<PhotoUploader onUpload={onUpload} />)

        const fileInput = screen.getByLabelText('Выбрать фото')
        const file = createMockFile()

        await user.upload(fileInput, file)

        expect(onUpload).toHaveBeenCalledWith(file)
    })

    it('shows loading state while uploading', async () => {
        let resolveUpload: (value: string) => void
        const onUpload = jest.fn().mockImplementation(
            () => new Promise<string>((resolve) => { resolveUpload = resolve })
        )

        const user = userEvent.setup()
        render(<PhotoUploader onUpload={onUpload} />)

        const fileInput = screen.getByLabelText('Выбрать фото')
        await user.upload(fileInput, createMockFile())

        expect(screen.getByText('Загрузка...')).toBeInTheDocument()

        const uploadButton = screen.getByText('Загрузка...').closest('button')
        expect(uploadButton).toBeDisabled()

        resolveUpload!('url')
        await waitFor(() => {
            expect(screen.getByText('Сделать или выбрать фото')).toBeInTheDocument()
        })
    })

    it('disables the upload button when isLoading is true', () => {
        render(<PhotoUploader {...defaultProps} isLoading />)

        const buttons = screen.getAllByRole('button')
        const uploadButton = buttons.find((b) => b.textContent?.includes('Загрузка'))
        expect(uploadButton).toBeDisabled()
    })

    it('does not show the remove button when no avatarUrl or onRemove', () => {
        render(<PhotoUploader {...defaultProps} />)

        expect(screen.queryByText('Удалить фото')).not.toBeInTheDocument()
    })

    it('does not show the remove button when avatarUrl is set but no onRemove', () => {
        render(
            <PhotoUploader
                {...defaultProps}
                avatarUrl="https://example.com/avatar.jpg"
            />
        )

        expect(screen.queryByText('Удалить фото')).not.toBeInTheDocument()
    })

    it('shows the remove button when both avatarUrl and onRemove are provided', () => {
        render(
            <PhotoUploader
                {...defaultProps}
                avatarUrl="https://example.com/avatar.jpg"
                onRemove={jest.fn().mockResolvedValue(undefined)}
            />
        )

        expect(screen.getByText('Удалить фото')).toBeInTheDocument()
    })

    it('calls onRemove when the remove button is clicked', async () => {
        const user = userEvent.setup()
        const onRemove = jest.fn().mockResolvedValue(undefined)

        render(
            <PhotoUploader
                {...defaultProps}
                avatarUrl="https://example.com/avatar.jpg"
                onRemove={onRemove}
            />
        )

        await user.click(screen.getByText('Удалить фото'))

        expect(onRemove).toHaveBeenCalledTimes(1)
    })

    it('disables buttons while removing the photo', async () => {
        let resolveRemove: () => void
        const onRemove = jest.fn().mockImplementation(
            () => new Promise<void>((resolve) => { resolveRemove = resolve })
        )

        const user = userEvent.setup()
        render(
            <PhotoUploader
                {...defaultProps}
                avatarUrl="https://example.com/avatar.jpg"
                onRemove={onRemove}
            />
        )

        await user.click(screen.getByText('Удалить фото'))

        // Both buttons should be disabled during removal
        const buttons = screen.getAllByRole('button')
        buttons.forEach((button) => {
            expect(button).toBeDisabled()
        })

        resolveRemove!()
        await waitFor(() => {
            expect(screen.getByText('Сделать или выбрать фото')).toBeInTheDocument()
        })
    })

    it('accepts only image files via the file input', () => {
        render(<PhotoUploader {...defaultProps} />)

        const fileInput = screen.getByLabelText('Выбрать фото')
        expect(fileInput).toHaveAttribute('accept', 'image/*')
    })

    it('renders the helper text', () => {
        render(<PhotoUploader {...defaultProps} />)

        expect(screen.getByText('Редактирование фото профиля')).toBeInTheDocument()
    })
})
