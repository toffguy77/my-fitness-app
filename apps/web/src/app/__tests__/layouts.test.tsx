/**
 * The admin and curator sections: who gets in.
 *
 * This file used to contain a copy of both layouts, with a comment saying the
 * copies mirrored the originals exactly. They stopped mirroring them the day
 * the originals changed, and the tests went on passing while the real layouts
 * sent every curator and administrator to the sign-in page. A copy of the code
 * under test tests nothing — so these import the real ones.
 */

import { render, screen, waitFor } from '@testing-library/react'

import AdminAppLayout from '../admin/layout'
import CuratorAppLayout from '../curator/layout'
import { useCurrentUser } from '@/shared/hooks/useCurrentUser'

const mockPush = jest.fn()
let mockPathname = '/curator'

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush, replace: jest.fn(), prefetch: jest.fn() }),
    usePathname: () => mockPathname,
}))

jest.mock('@/shared/hooks/useCurrentUser', () => ({
    useCurrentUser: jest.fn(),
}))

jest.mock('@/features/admin', () => ({
    AdminLayout: ({ children, userName }: { children: React.ReactNode; userName: string }) => (
        <div data-testid="admin-layout" data-user={userName}>{children}</div>
    ),
}))

jest.mock('@/features/curator', () => ({
    CuratorLayout: ({ children, userName }: { children: React.ReactNode; userName: string }) => (
        <div data-testid="curator-layout" data-user={userName}>{children}</div>
    ),
}))

const currentUser = useCurrentUser as jest.Mock

beforeEach(() => {
    jest.clearAllMocks()
    mockPathname = '/curator'
})

describe('the administrative section', () => {
    it('renders for an administrator', () => {
        currentUser.mockReturnValue({
            user: { id: '1', email: 'a@b.c', full_name: 'Admin', role: 'super_admin' },
            state: 'ready',
        })

        render(<AdminAppLayout><div>inside</div></AdminAppLayout>)

        expect(screen.getByTestId('admin-layout')).toHaveAttribute('data-user', 'Admin')
        expect(screen.getByText('inside')).toBeInTheDocument()
        expect(mockPush).not.toHaveBeenCalled()
    })

    it('sends somebody with another role to their own dashboard', async () => {
        currentUser.mockReturnValue({
            user: { id: '1', email: 'a@b.c', role: 'client' },
            state: 'ready',
        })

        render(<AdminAppLayout><div>inside</div></AdminAppLayout>)

        await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'))
        expect(screen.queryByText('inside')).not.toBeInTheDocument()
    })

    it('waits rather than redirecting while the session is being established', async () => {
        // A session established by cookie alone has no cached profile. Treating
        // that as "not signed in" sent every administrator to the sign-in page.
        currentUser.mockReturnValue({ user: null, state: 'loading' })

        render(<AdminAppLayout><div>inside</div></AdminAppLayout>)

        await waitFor(() => expect(mockPush).not.toHaveBeenCalled())
        expect(screen.queryByText('inside')).not.toBeInTheDocument()
    })

    it('sends somebody with no session to sign in', async () => {
        currentUser.mockReturnValue({ user: null, state: 'anonymous' })

        render(<AdminAppLayout><div>inside</div></AdminAppLayout>)

        await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/auth'))
    })
})

describe('the curator section', () => {
    it('renders for a curator', () => {
        currentUser.mockReturnValue({
            user: { id: '2', email: 'c@b.c', full_name: 'Curator', role: 'coordinator' },
            state: 'ready',
        })

        render(<CuratorAppLayout><div>inside</div></CuratorAppLayout>)

        expect(screen.getByTestId('curator-layout')).toHaveAttribute('data-user', 'Curator')
        expect(mockPush).not.toHaveBeenCalled()
    })

    it('sends a client to their own dashboard', async () => {
        currentUser.mockReturnValue({
            user: { id: '2', email: 'c@b.c', role: 'client' },
            state: 'ready',
        })

        render(<CuratorAppLayout><div>inside</div></CuratorAppLayout>)

        await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'))
        expect(screen.queryByText('inside')).not.toBeInTheDocument()
    })

    it('waits rather than redirecting while the session is being established', async () => {
        currentUser.mockReturnValue({ user: null, state: 'loading' })

        render(<CuratorAppLayout><div>inside</div></CuratorAppLayout>)

        await waitFor(() => expect(mockPush).not.toHaveBeenCalled())
    })

    it('falls back to the name when there is no full name', () => {
        currentUser.mockReturnValue({
            user: { id: '2', email: 'c@b.c', name: 'Просто Имя', role: 'coordinator' },
            state: 'ready',
        })

        render(<CuratorAppLayout><div>inside</div></CuratorAppLayout>)

        expect(screen.getByTestId('curator-layout')).toHaveAttribute('data-user', 'Просто Имя')
    })

    // Leads and support are the two routes the backend guards with
    // RequireRole("coordinator", "super_admin") (internal/router/leads.go,
    // support.go) — the same escalation notification that used to send a
    // super-admin to /admin/support now sends them to /curator/support, and
    // this is the only door left standing for that role.
    it.each(['/curator/leads', '/curator/support'])(
        'lets a super-administrator into %s',
        (pathname) => {
            currentUser.mockReturnValue({
                user: { id: '3', email: 'a@b.c', full_name: 'Admin', role: 'super_admin' },
                state: 'ready',
            })
            mockPathname = pathname

            render(<CuratorAppLayout><div>inside</div></CuratorAppLayout>)

            expect(screen.getByTestId('curator-layout')).toBeInTheDocument()
            expect(screen.getByText('inside')).toBeInTheDocument()
            expect(mockPush).not.toHaveBeenCalled()
        }
    )

    // Everywhere else in the section is coordinator-only on the backend too
    // (RequireRole("coordinator") in internal/router/curator.go) — widening
    // the frontend gate for the whole section would let a super-admin land
    // on a client list the backend then answers with 403 on every request.
    it('still turns a super-administrator away from the rest of the section', async () => {
        currentUser.mockReturnValue({
            user: { id: '3', email: 'a@b.c', role: 'super_admin' },
            state: 'ready',
        })
        mockPathname = '/curator'

        render(<CuratorAppLayout><div>inside</div></CuratorAppLayout>)

        await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'))
        expect(screen.queryByText('inside')).not.toBeInTheDocument()
    })
})
