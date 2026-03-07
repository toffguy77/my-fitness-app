/**
 * Unit tests for admin page components
 * Tests that Next.js admin pages render their feature components
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
    useParams: () => ({ id: '42' }),
}))

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
    Loader2: () => <div data-testid="loader">Loading</div>,
    ArrowLeft: () => <div data-testid="arrow-left">Back</div>,
}))

// Mock admin feature components
jest.mock('@/features/admin', () => ({
    adminApi: {
        getCurators: jest.fn().mockResolvedValue([]),
        getUsers: jest.fn().mockResolvedValue([]),
    },
    CuratorLoadCard: ({ curator }: { curator: { id: number } }) => (
        <div data-testid="curator-load-card">{curator.id}</div>
    ),
}))

jest.mock('@/features/admin/components/UserList', () => ({
    UserList: () => <div data-testid="user-list">UserList</div>,
}))

jest.mock('@/features/admin/components/UserDetail', () => ({
    UserDetail: ({ userId }: { userId: number }) => (
        <div data-testid="user-detail">UserDetail {userId}</div>
    ),
}))

jest.mock('@/features/admin/components/AdminConversationList', () => ({
    AdminConversationList: () => <div data-testid="admin-conversation-list">AdminConversationList</div>,
}))

jest.mock('@/features/admin/components/ReadOnlyMessageList', () => ({
    ReadOnlyMessageList: ({ conversationId }: { conversationId: string }) => (
        <div data-testid="readonly-message-list">Messages for {conversationId}</div>
    ),
}))

jest.mock('@/features/content/components/ArticleList', () => ({
    ArticleList: (props: { basePath?: string; showAuthor?: boolean }) => (
        <div data-testid="article-list" data-base-path={props.basePath}>ArticleList</div>
    ),
}))

jest.mock('@/features/content/components/ArticleEditor', () => ({
    ArticleEditor: (props: { articleId?: string; returnPath?: string }) => (
        <div data-testid="article-editor" data-article-id={props.articleId}>ArticleEditor</div>
    ),
}))

import AdminDashboardPage from '../admin/page'
import AdminUsersPage from '../admin/users/page'
import AdminUserDetailPage from '../admin/users/[id]/page'
import AdminChatsPage from '../admin/chats/page'
import AdminChatDetailPage from '../admin/chats/[id]/page'
import AdminContentPage from '../admin/content/page'
import AdminNewArticlePage from '../admin/content/new/page'
import AdminEditArticlePage from '../admin/content/[id]/edit/page'

describe('Admin Pages', () => {
    describe('AdminDashboardPage', () => {
        it('renders without crashing', async () => {
            render(<AdminDashboardPage />)
            // Initially shows loader while fetching
            expect(screen.getByTestId('loader')).toBeInTheDocument()
        })
    })

    describe('AdminUsersPage', () => {
        it('renders the page title and UserList', () => {
            render(<AdminUsersPage />)
            expect(screen.getByText('Пользователи')).toBeInTheDocument()
            expect(screen.getByTestId('user-list')).toBeInTheDocument()
        })
    })

    describe('AdminUserDetailPage', () => {
        it('renders UserDetail with userId from params', () => {
            render(<AdminUserDetailPage />)
            expect(screen.getByTestId('user-detail')).toBeInTheDocument()
            expect(screen.getByText(/42/)).toBeInTheDocument()
        })
    })

    describe('AdminChatsPage', () => {
        it('renders the page title and conversation list', () => {
            render(<AdminChatsPage />)
            expect(screen.getByText('Все чаты')).toBeInTheDocument()
            expect(screen.getByTestId('admin-conversation-list')).toBeInTheDocument()
        })
    })

    describe('AdminChatDetailPage', () => {
        it('renders the header and message list', () => {
            render(<AdminChatDetailPage />)
            expect(screen.getByText('Просмотр чата')).toBeInTheDocument()
            expect(screen.getByTestId('readonly-message-list')).toBeInTheDocument()
        })
    })

    describe('AdminContentPage', () => {
        it('renders the page title and ArticleList', () => {
            render(<AdminContentPage />)
            expect(screen.getByText('Контент')).toBeInTheDocument()
            expect(screen.getByTestId('article-list')).toBeInTheDocument()
        })
    })

    describe('AdminNewArticlePage', () => {
        it('renders the page title and ArticleEditor', () => {
            render(<AdminNewArticlePage />)
            expect(screen.getByText('Новая статья')).toBeInTheDocument()
            expect(screen.getByTestId('article-editor')).toBeInTheDocument()
        })
    })

    describe('AdminEditArticlePage', () => {
        it('renders without crashing with Promise params', () => {
            const params = Promise.resolve({ id: '99' })
            // use(params) triggers Suspense; verify the page mounts without throwing
            const { container } = render(
                <Suspense fallback={<div data-testid="suspense-fallback">Loading...</div>}>
                    <AdminEditArticlePage params={params} />
                </Suspense>
            )
            expect(container).toBeTruthy()
        })
    })
})
