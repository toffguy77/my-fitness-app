import { render, screen } from '@testing-library/react'
import { FileAttachment } from '../FileAttachment'
import type { MessageAttachment } from '../../types'

describe('FileAttachment', () => {
    describe('image attachment', () => {
        const imageAttachment: MessageAttachment = {
            id: 'att-1',
            file_url: '/uploads/photo.jpg',
            file_name: 'photo.jpg',
            file_size: 2048000,
            mime_type: 'image/jpeg',
        }

        it('shows thumbnail preview for image', () => {
            render(<FileAttachment attachment={imageAttachment} />)
            const img = screen.getByAltText('photo.jpg')
            expect(img).toBeInTheDocument()
            expect(img).toHaveAttribute('src', '/uploads/photo.jpg')
        })

        it('shows file name and formatted size for image', () => {
            render(<FileAttachment attachment={imageAttachment} />)
            expect(screen.getByText(/photo\.jpg/)).toBeInTheDocument()
            expect(screen.getByText(/2\.0 MB/)).toBeInTheDocument()
        })
    })

    describe('non-image attachment', () => {
        const fileAttachment: MessageAttachment = {
            id: 'att-2',
            file_url: '/uploads/document.pdf',
            file_name: 'document.pdf',
            file_size: 5242880,
            mime_type: 'application/pdf',
        }

        it('shows file name', () => {
            render(<FileAttachment attachment={fileAttachment} />)
            expect(screen.getByText('document.pdf')).toBeInTheDocument()
        })

        it('shows formatted size in MB', () => {
            render(<FileAttachment attachment={fileAttachment} />)
            expect(screen.getByText('5.0 MB')).toBeInTheDocument()
        })

        it('does not render an img tag', () => {
            const { container } = render(<FileAttachment attachment={fileAttachment} />)
            expect(container.querySelector('img')).toBeNull()
        })
    })

    describe('formatFileSize', () => {
        it('formats bytes', () => {
            render(
                <FileAttachment
                    attachment={{
                        id: 'att-3',
                        file_url: '/f',
                        file_name: 'tiny.txt',
                        file_size: 500,
                        mime_type: 'text/plain',
                    }}
                />
            )
            expect(screen.getByText('500 B')).toBeInTheDocument()
        })

        it('formats KB', () => {
            render(
                <FileAttachment
                    attachment={{
                        id: 'att-4',
                        file_url: '/f',
                        file_name: 'small.txt',
                        file_size: 1536,
                        mime_type: 'text/plain',
                    }}
                />
            )
            expect(screen.getByText('1.5 KB')).toBeInTheDocument()
        })
    })
})
