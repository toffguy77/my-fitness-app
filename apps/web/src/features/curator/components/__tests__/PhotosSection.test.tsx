import { render, screen } from '@testing-library/react'
import { PhotosSection } from '../PhotosSection'
import type { PhotoView } from '../../types'

jest.mock('next/image', () => ({
    __esModule: true,
    default: (props: Record<string, unknown>) => (
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
        <img {...props} />
    ),
}))

function makePhoto(overrides: Partial<PhotoView> = {}): PhotoView {
    return {
        id: 'p1',
        photo_url: 'https://example.com/photo.jpg',
        week_start: '2026-03-01',
        week_end: '2026-03-07',
        uploaded_at: '2026-03-05T10:00:00Z',
        ...overrides,
    }
}

describe('PhotosSection', () => {
    it('returns null when photos array is empty', () => {
        const { container } = render(<PhotosSection photos={[]} />)
        expect(container.innerHTML).toBe('')
    })

    it('returns null when photos is undefined-like empty', () => {
        const { container } = render(<PhotosSection photos={[]} />)
        expect(container.innerHTML).toBe('')
    })

    it('renders section title', () => {
        render(<PhotosSection photos={[makePhoto()]} />)

        expect(screen.getByText('Фото клиента')).toBeInTheDocument()
    })

    it('renders photo images', () => {
        render(<PhotosSection photos={[makePhoto()]} />)

        const img = screen.getByRole('img')
        expect(img).toHaveAttribute('src', 'https://example.com/photo.jpg')
    })

    it('renders multiple photos', () => {
        render(
            <PhotosSection
                photos={[
                    makePhoto({ id: 'p1' }),
                    makePhoto({ id: 'p2', photo_url: 'https://example.com/photo2.jpg' }),
                ]}
            />
        )

        const imgs = screen.getAllByRole('img')
        expect(imgs).toHaveLength(2)
    })

    it('displays date range text', () => {
        render(<PhotosSection photos={[makePhoto({ week_start: '2026-03-01', week_end: '2026-03-07' })]} />)

        // Should contain formatted Russian date range
        expect(screen.getByText(/мар/)).toBeInTheDocument()
    })
})
