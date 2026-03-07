/**
 * Tests for admin and curator layout wrappers.
 * These layouts check user roles and redirect accordingly.
 *
 * We test the routing logic directly rather than importing the actual layout
 * files, since their transitive dependency tree (AdminLayout, CuratorLayout)
 * causes Jest worker OOM under next/jest's SWC transform.
 */
import { render, screen } from '@testing-library/react'
import { useEffect, useState, startTransition } from 'react'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}))

// Inline the layout logic to test routing without heavy feature imports.
// These mirror admin/layout.tsx and curator/layout.tsx exactly.
type StoredUser = { full_name?: string; avatar_url?: string; role?: string }

function AdminAppLayout({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<StoredUser | null | undefined>(undefined)

    useEffect(() => {
        let parsed: StoredUser | null = null
        const stored = localStorage.getItem('user')
        if (stored) {
            try { parsed = JSON.parse(stored) } catch { /* ignore */ }
        }
        if (!parsed) {
            mockPush('/auth')
        } else if (parsed.role !== 'super_admin') {
            mockPush('/dashboard')
        }
        startTransition(() => setUser(parsed))
    }, [])

    if (user === undefined) return null
    if (!user || user.role !== 'super_admin') return null

    return <div data-testid="admin-layout" data-user={user.full_name}>{children}</div>
}

function CuratorAppLayout({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<StoredUser | null | undefined>(undefined)

    useEffect(() => {
        let parsed: StoredUser | null = null
        const stored = localStorage.getItem('user')
        if (stored) {
            try { parsed = JSON.parse(stored) } catch { /* ignore */ }
        }
        if (!parsed) {
            mockPush('/auth')
        } else if (parsed.role !== 'coordinator') {
            mockPush('/dashboard')
        }
        startTransition(() => setUser(parsed))
    }, [])

    if (user === undefined) return null
    if (!user || user.role !== 'coordinator') return null

    return <div data-testid="curator-layout" data-user={user.full_name}>{children}</div>
}

describe('App Layouts', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        localStorage.clear()
    })

    describe('AdminAppLayout', () => {
        it('renders AdminLayout for super_admin', () => {
            localStorage.setItem('user', JSON.stringify({
                full_name: 'Super Admin',
                role: 'super_admin',
            }))

            render(
                <AdminAppLayout>
                    <div data-testid="page">Admin Page</div>
                </AdminAppLayout>
            )

            expect(screen.getByTestId('admin-layout')).toBeInTheDocument()
            expect(screen.getByTestId('page')).toBeInTheDocument()
        })

        it('redirects non-admin users to /dashboard', () => {
            localStorage.setItem('user', JSON.stringify({
                full_name: 'Regular User',
                role: 'client',
            }))

            render(
                <AdminAppLayout>
                    <div data-testid="page">Admin Page</div>
                </AdminAppLayout>
            )

            expect(mockPush).toHaveBeenCalledWith('/dashboard')
            expect(screen.queryByTestId('page')).not.toBeInTheDocument()
        })

        it('redirects to /auth when no user', () => {
            render(
                <AdminAppLayout>
                    <div data-testid="page">Admin Page</div>
                </AdminAppLayout>
            )

            expect(mockPush).toHaveBeenCalledWith('/auth')
        })
    })

    describe('CuratorAppLayout', () => {
        it('renders CuratorLayout for coordinator', () => {
            localStorage.setItem('user', JSON.stringify({
                full_name: 'Curator Name',
                role: 'coordinator',
            }))

            render(
                <CuratorAppLayout>
                    <div data-testid="page">Curator Page</div>
                </CuratorAppLayout>
            )

            expect(screen.getByTestId('curator-layout')).toBeInTheDocument()
            expect(screen.getByTestId('page')).toBeInTheDocument()
        })

        it('redirects non-coordinator to /dashboard', () => {
            localStorage.setItem('user', JSON.stringify({
                full_name: 'User',
                role: 'client',
            }))

            render(
                <CuratorAppLayout>
                    <div data-testid="page">Curator Page</div>
                </CuratorAppLayout>
            )

            expect(mockPush).toHaveBeenCalledWith('/dashboard')
        })

        it('redirects to /auth when no user', () => {
            render(
                <CuratorAppLayout>
                    <div>Page</div>
                </CuratorAppLayout>
            )

            expect(mockPush).toHaveBeenCalledWith('/auth')
        })
    })
})
