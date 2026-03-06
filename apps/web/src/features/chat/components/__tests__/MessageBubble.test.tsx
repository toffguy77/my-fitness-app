import { render, screen } from '@testing-library/react'
import { MessageBubble } from '../MessageBubble'
import type { Message } from '../../types'

// Mock child components
jest.mock('../FoodEntryCard', () => ({
    FoodEntryCard: ({ metadata }: { metadata: unknown }) => (
        <div data-testid="food-entry-card">Food Entry</div>
    ),
}))

jest.mock('../FileAttachment', () => ({
    FileAttachment: ({ attachment }: { attachment: unknown }) => (
        <div data-testid="file-attachment">File</div>
    ),
}))

function makeMessage(overrides: Partial<Message> = {}): Message {
    return {
        id: 'msg-1',
        conversation_id: 'conv-1',
        sender_id: 1,
        type: 'text',
        content: 'Hello world',
        created_at: '2025-06-15T14:30:00Z',
        ...overrides,
    }
}

describe('MessageBubble', () => {
    it('renders text content', () => {
        render(<MessageBubble message={makeMessage()} isOwn={false} />)
        expect(screen.getByText('Hello world')).toBeInTheDocument()
    })

    it('own messages have blue background', () => {
        const { container } = render(<MessageBubble message={makeMessage()} isOwn={true} />)
        const bubble = container.querySelector('.bg-blue-500')
        expect(bubble).toBeInTheDocument()
    })

    it('other messages have gray background', () => {
        const { container } = render(<MessageBubble message={makeMessage()} isOwn={false} />)
        const bubble = container.querySelector('.bg-gray-100')
        expect(bubble).toBeInTheDocument()
    })

    it('own messages are right-aligned', () => {
        const { container } = render(<MessageBubble message={makeMessage()} isOwn={true} />)
        const wrapper = container.firstChild as HTMLElement
        expect(wrapper.className).toContain('justify-end')
    })

    it('other messages are left-aligned', () => {
        const { container } = render(<MessageBubble message={makeMessage()} isOwn={false} />)
        const wrapper = container.firstChild as HTMLElement
        expect(wrapper.className).toContain('justify-start')
    })

    it('shows time', () => {
        render(<MessageBubble message={makeMessage()} isOwn={false} />)
        // The time display depends on locale, but should contain digits
        const timeEl = screen.getByText(/\d{2}:\d{2}/)
        expect(timeEl).toBeInTheDocument()
    })

    it('renders image message', () => {
        render(
            <MessageBubble
                message={makeMessage({ type: 'image', content: '/photo.jpg' })}
                isOwn={false}
            />
        )
        const img = screen.getByAltText('Изображение')
        expect(img).toHaveAttribute('src', '/photo.jpg')
    })

    it('renders file message with FileAttachment', () => {
        render(
            <MessageBubble
                message={makeMessage({
                    type: 'file',
                    attachments: [
                        {
                            id: 'att-1',
                            file_url: '/doc.pdf',
                            file_name: 'doc.pdf',
                            file_size: 1024,
                            mime_type: 'application/pdf',
                        },
                    ],
                })}
                isOwn={false}
            />
        )
        expect(screen.getByTestId('file-attachment')).toBeInTheDocument()
    })

    it('renders food_entry message with FoodEntryCard', () => {
        render(
            <MessageBubble
                message={makeMessage({
                    type: 'food_entry',
                    metadata: { food_name: 'Chicken' },
                })}
                isOwn={false}
            />
        )
        expect(screen.getByTestId('food-entry-card')).toBeInTheDocument()
    })
})
