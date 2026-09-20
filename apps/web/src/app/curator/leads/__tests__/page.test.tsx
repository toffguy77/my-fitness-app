import { render, screen } from '@testing-library/react'
import CuratorLeadsPage from '../page'

/**
 * The page itself is a thin wrapper — heading plus the list. What matters is
 * that it is wired to the curator's list, not the administrator's: a page
 * that still imported `LeadList` from `@/features/admin` would render
 * identically to the eye and call the retired `/api/v1/admin/leads` under
 * it, which is exactly the mistake `check-api-contract.mjs` exists to catch
 * at the network layer. This test catches it one layer up, at the import.
 */
jest.mock('@/features/curator/components/LeadList', () => ({
    LeadList: () => <div data-testid="curator-lead-list">список заявок куратора</div>,
}))

describe('CuratorLeadsPage', () => {
    it('shows the leads heading and the curator lead list', () => {
        render(<CuratorLeadsPage />)

        expect(screen.getByRole('heading', { name: 'Заявки' })).toBeInTheDocument()
        expect(screen.getByTestId('curator-lead-list')).toBeInTheDocument()
    })
})
