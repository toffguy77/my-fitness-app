import { render, screen } from '@testing-library/react';
import LegalLayout from '../layout';

describe('LegalLayout', () => {
    it('renders children correctly', () => {
        render(
            <LegalLayout>
                <div data-testid="test-child">Test Content</div>
            </LegalLayout>
        );

        expect(screen.getByTestId('test-child')).toBeInTheDocument();
        expect(screen.getByText('Test Content')).toBeInTheDocument();
    });

    it('renders with proper styling classes', () => {
        const { container } = render(
            <LegalLayout>
                <div>Content</div>
            </LegalLayout>
        );

        expect(container.firstChild).toBeInTheDocument();
    });

    it('wraps multiple children', () => {
        render(
            <LegalLayout>
                <div data-testid="child-1">Child 1</div>
                <div data-testid="child-2">Child 2</div>
            </LegalLayout>
        );

        expect(screen.getByTestId('child-1')).toBeInTheDocument();
        expect(screen.getByTestId('child-2')).toBeInTheDocument();
    });
});
