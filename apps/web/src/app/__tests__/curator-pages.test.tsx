/**
 * Unit tests for curator page components
 * Tests that Next.js curator pages render their feature components
 */

import React, { Suspense } from 'react'
import { render, screen, waitFor } from '@testing-library/react'

// Mock next/navigation
jest.mock('next/navigation', () => ({
    useRouter: () => ({
        push: jest.fn(),
        replace: jest.fn(),
        back: jest.fn(),
    }),
    useParams: () => ({ id: '7', clientId: '7' }),
}))

// Mock next/image
jest.mock('next/image', () => ({
    __esModule: true,
    default: (props: Record<string, unknown>) => <img {...props} />,
}))

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
    ArrowLeft: () => <div data-testid="arrow-left">Back</div>,
    MessageCircle: () => <div>MessageCircle</div>,
    Loader2: () => <div data-testid="loader">Loading</div>,
    Check: () => <div>Check</div>,
    X: () => <div>X</div>,
    ChevronDown: () => <div>ChevronDown</div>,
    Droplets: () => <div>Droplets</div>,
}))

// Mock recharts
jest.mock('recharts', () => ({
    LineChart: () => null,
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    ResponsiveContainer: () => null,
    ReferenceLine: () => null,
}))

// Mock curator feature components
jest.mock('@/features/curator/components/ClientList', () => ({
    ClientList: () => <div data-testid="client-list">ClientList</div>,
}))

jest.mock('@/features/curator/api/curatorApi', () => ({
    curatorApi: {
        getClientDetail: jest.fn().mockResolvedValue({
            name: 'Test Client',
            days: [],
            alerts: [],
            photos: [],
            weight_history: [],
        }),
        setTargetWeight: jest.fn(),
        setWaterGoal: jest.fn(),
    },
}))

jest.mock('@/features/nutrition-calc/api/nutritionCalc', () => ({
    getClientHistory: jest.fn().mockResolvedValue({ days: [] }),
}))

jest.mock('@/features/nutrition-calc/components/KBJUWeeklyChart', () => ({
    KBJUWeeklyChart: () => <div data-testid="kbju-chart">KBJUWeeklyChart</div>,
}))

jest.mock('@/features/curator/components/AlertBadge', () => ({
    AlertBadge: () => <div data-testid="alert-badge">AlertBadge</div>,
}))

jest.mock('@/features/curator/components/DaySection', () => ({
    DaySection: () => <div data-testid="day-section">DaySection</div>,
}))

jest.mock('@/features/curator/components/StepsChart', () => ({
    StepsChart: () => <div data-testid="steps-chart">StepsChart</div>,
}))

jest.mock('@/features/curator/components/WaterChart', () => ({
    WaterChart: () => <div data-testid="water-chart">WaterChart</div>,
}))

jest.mock('@/features/curator/components/WorkoutsSection', () => ({
    WorkoutsSection: () => <div data-testid="workouts-section">WorkoutsSection</div>,
}))

jest.mock('@/features/curator/components/PhotosSection', () => ({
    PhotosSection: () => <div data-testid="photos-section">PhotosSection</div>,
}))

jest.mock('@/features/curator/components/ClientInfoPanel', () => ({
    ClientInfoPanel: () => <div data-testid="client-info-panel">ClientInfoPanel</div>,
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

jest.mock('@/features/chat/components/ConversationList', () => ({
    ConversationList: () => <div data-testid="conversation-list">ConversationList</div>,
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

jest.mock('@/features/chat/components/FoodEntryForm', () => ({
    FoodEntryForm: () => <div data-testid="food-entry-form">FoodEntryForm</div>,
}))

// Mock content feature components
jest.mock('@/features/content/components/ArticleList', () => ({
    ArticleList: (props: { basePath?: string }) => (
        <div data-testid="article-list">ArticleList</div>
    ),
}))

jest.mock('@/features/content/components/ArticleEditor', () => ({
    ArticleEditor: (props: { articleId?: string; returnPath?: string }) => (
        <div data-testid="article-editor" data-article-id={props.articleId}>ArticleEditor</div>
    ),
}))

import CuratorDashboardPage from '../curator/page'
import CuratorChatListPage from '../curator/chat/page'
import CuratorChatPage from '../curator/chat/[clientId]/page'
import CuratorContentPage from '../curator/content/page'
import CuratorNewArticlePage from '../curator/content/new/page'
import CuratorEditArticlePage from '../curator/content/[id]/edit/page'
import ClientDetailPage from '../curator/clients/[id]/page'

describe('Curator Pages', () => {
    describe('CuratorDashboardPage', () => {
        it('renders the page title and ClientList', () => {
            render(<CuratorDashboardPage />)
            expect(screen.getByText('Мои клиенты')).toBeInTheDocument()
            expect(screen.getByTestId('client-list')).toBeInTheDocument()
        })
    })

    describe('CuratorChatListPage', () => {
        it('renders the page title and ConversationList', () => {
            render(<CuratorChatListPage />)
            expect(screen.getByText('Чаты')).toBeInTheDocument()
            expect(screen.getByTestId('conversation-list')).toBeInTheDocument()
        })
    })

    describe('CuratorChatPage', () => {
        it('renders chat UI components', () => {
            render(<CuratorChatPage />)
            expect(screen.getByTestId('message-list')).toBeInTheDocument()
            expect(screen.getByTestId('chat-input')).toBeInTheDocument()
            expect(screen.getByTestId('typing-indicator')).toBeInTheDocument()
        })
    })

    describe('CuratorContentPage', () => {
        it('renders the page title and ArticleList', () => {
            render(<CuratorContentPage />)
            expect(screen.getByText('Мой контент')).toBeInTheDocument()
            expect(screen.getByTestId('article-list')).toBeInTheDocument()
        })
    })

    describe('CuratorNewArticlePage', () => {
        it('renders the page title and ArticleEditor', () => {
            render(<CuratorNewArticlePage />)
            expect(screen.getByText('Новая статья')).toBeInTheDocument()
            expect(screen.getByTestId('article-editor')).toBeInTheDocument()
        })
    })

    describe('CuratorEditArticlePage', () => {
        it('renders without crashing with Promise params', () => {
            const params = Promise.resolve({ id: '55' })
            // use(params) triggers Suspense; verify the page mounts without throwing
            const { container } = render(
                <Suspense fallback={<div data-testid="suspense-fallback">Loading...</div>}>
                    <CuratorEditArticlePage params={params} />
                </Suspense>
            )
            expect(container).toBeTruthy()
        })
    })

    describe('ClientDetailPage', () => {
        it('renders without crashing and shows loader initially', () => {
            render(<ClientDetailPage />)
            expect(screen.getByTestId('loader')).toBeInTheDocument()
        })
    })
})
