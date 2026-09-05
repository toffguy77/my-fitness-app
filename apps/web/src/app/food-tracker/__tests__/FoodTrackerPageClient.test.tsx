/**
 * The page no longer decides whether somebody is signed in — middleware.ts
 * does that before this renders. What is left is telling "still working it
 * out" apart from "no session", which are different screens.
 */

import { render, screen, waitFor } from '@testing-library/react';

import { FoodTrackerPageClient } from '../FoodTrackerPageClient';
import { useSession } from '@/shared/hooks/useSession';

jest.mock('@/features/food-tracker/components/FoodTrackerPage', () => ({
    FoodTrackerPage: () => <div data-testid="food-tracker-page">Food Tracker Page</div>,
}));

jest.mock('@/shared/hooks/useSession', () => ({
    useSession: jest.fn(),
}));

const session = useSession as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('FoodTrackerPageClient', () => {
    it('renders the tracker once the session is established', async () => {
        session.mockReturnValue('authenticated');

        render(<FoodTrackerPageClient />);

        await waitFor(() => {
            expect(screen.getByTestId('food-tracker-page')).toBeInTheDocument();
        });
    });

    it('waits rather than showing the page while the session is being restored', () => {
        // The access token lives in memory and does not survive a reload; it
        // is minted from the cookie a moment later. Rendering "signed out"
        // during that moment would flash at somebody who is signed in.
        session.mockReturnValue('restoring');

        const { container } = render(<FoodTrackerPageClient />);

        expect(container.querySelector('.animate-spin')).toBeInTheDocument();
        expect(screen.queryByTestId('food-tracker-page')).not.toBeInTheDocument();
    });

    it('renders nothing useful for a session that turned out not to exist', () => {
        session.mockReturnValue('anonymous');

        render(<FoodTrackerPageClient />);

        expect(screen.queryByTestId('food-tracker-page')).not.toBeInTheDocument();
    });
});
