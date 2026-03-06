/**
 * Unit tests for the chat page component
 * Tests that the chat page renders its feature components
 */

import React from 'react'
import { render, screen } from '@testing-library/react'

// Mock next/navigation
jest.mock('next/navigation', () => ({
    useRouter: () => ({
        push: jest.fn(),
        replace: jest.fn(),
        back: jest.fn(),
    }),
}))

// Mock dashboard layout
jest.mock('@/features/dashboard/components/DashboardLayout', () => ({
    DashboardLayout: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="dashboard-layout">{children}</div>
    ),
}))

// Mock chat feature components
jest.mock('@/features/chat/api/chatApi', () => ({
    chatApi: {
        getConversations: jest.fn().mockResolvedValue([]),
        markAsRead: jest.fn(),
    },
}))

jest.mock('@/features/chat/store/chatStore', () => ({
    useChatStore: Object.assign(
        () => ({ resetUnread: jest.fn() }),
        { getState: () => ({ resetUnread: jest.fn() }) },
    ),
}))

jest.mock('@/features/chat/hooks/useChat', () => ({
    useChat: () => ({
        messages: [],
        isLoading: false,
        hasMore: false,
        loadMore: jest.fn(),
        sendMessage: jest.fn(),
        sendFile: jest.fn(),
        sendTyping: jest.fn(),
        lastEvent: null,
    }),
}))

jest.mock('@/features/chat/components/MessageList', () => ({
    MessageList: () => <div data-testid="message-list">MessageList</div>,
}))

jest.mock('@/features/chat/components/ChatInput', () => ({
    ChatInput: () => <div data-testid="chat-input">ChatInput</div>,
}))

jest.mock('@/features/chat/components/TypingIndicator', () => ({
    TypingIndicator: () => <div data-testid="typing-indicator">TypingIndicator</div>,
}))

import ChatPage from '../chat/page'

describe('ChatPage', () => {
    beforeEach(() => {
        // Simulate authenticated user
        Storage.prototype.getItem = jest.fn((key: string) => {
            if (key === 'auth_token') return 'mock-token'
            if (key === 'user') return JSON.stringify({ name: 'Test User', email: 'test@example.com' })
            return null
        })
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('renders within DashboardLayout', () => {
        render(<ChatPage />)
        expect(screen.getByTestId('dashboard-layout')).toBeInTheDocument()
    })
})
