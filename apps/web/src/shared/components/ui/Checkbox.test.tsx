import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
    describe('Rendering', () => {
        it('renders checkbox without label', () => {
            render(<Checkbox />);
            const checkbox = screen.getByRole('checkbox');
            expect(checkbox).toBeInTheDocument();
        });

        it('renders checkbox with label', () => {
            render(<Checkbox label="Accept terms" />);
            const checkbox = screen.getByRole('checkbox', { name: /accept terms/i });
            expect(checkbox).toBeInTheDocument();
        });

        it('renders checkbox with helper text', () => {
            render(<Checkbox label="Subscribe" helperText="Get weekly updates" />);
            expect(screen.getByText('Get weekly updates')).toBeInTheDocument();
        });

        it('renders checkbox with ReactNode label', () => {
            const label = (
                <span>
                    I agree to the <a href="/terms">Terms</a>
                </span>
            );
            render(<Checkbox label={label} />);
            expect(screen.getByText('I agree to the')).toBeInTheDocument();
            expect(screen.getByRole('link', { name: /terms/i })).toBeInTheDocument();
        });
    });

    describe('ID Generation', () => {
        it('uses provided id', () => {
            render(<Checkbox id="custom-id" label="Test" />);
            const checkbox = screen.getByRole('checkbox');
            expect(checkbox).toHaveAttribute('id', 'custom-id');
        });

        it('generates unique id when not provided', () => {
            const { container: container1 } = render(<Checkbox label="First" />);
            const { container: container2 } = render(<Checkbox label="Second" />);

            const checkbox1 = container1.querySelector('input[type="checkbox"]');
            const checkbox2 = container2.querySelector('input[type="checkbox"]');

            expect(checkbox1?.id).toBeTruthy();
            expect(checkbox2?.id).toBeTruthy();
            expect(checkbox1?.id).not.toBe(checkbox2?.id);
        });

        it('associates label with checkbox via id', () => {
            render(<Checkbox label="Test label" />);
            const checkbox = screen.getByRole('checkbox', { name: /test label/i });
            const label = screen.getByText('Test label');

            expect(checkbox.id).toBeTruthy();
            expect(label).toHaveAttribute('for', checkbox.id);
        });
    });

    describe('Error State', () => {
        it('applies error styles when error prop is true', () => {
            render(<Checkbox label="Test" error />);
            const checkbox = screen.getByRole('checkbox');
            expect(checkbox).toHaveAttribute('aria-invalid', 'true');
            expect(checkbox).toHaveClass('border-red-500');
        });

        it('applies error styles to label', () => {
            render(<Checkbox label="Test" error />);
            const label = screen.getByText('Test');
            expect(label).toHaveClass('text-red-600');
        });

        it('applies error styles to helper text', () => {
            render(<Checkbox label="Test" helperText="Helper" error />);
            const helper = screen.getByText('Helper');
            expect(helper).toHaveClass('text-red-600');
        });

        it('does not have error styles when error is false', () => {
            render(<Checkbox label="Test" error={false} />);
            const checkbox = screen.getByRole('checkbox');
            expect(checkbox).not.toHaveAttribute('aria-invalid', 'true');
            expect(checkbox).not.toHaveClass('border-red-500');
        });
    });

    describe('Accessibility', () => {
        it('has proper aria-describedby when helper text is provided', () => {
            render(<Checkbox label="Test" helperText="Helper text" />);
            const checkbox = screen.getByRole('checkbox');
            const helperId = checkbox.getAttribute('aria-describedby');

            expect(helperId).toBeTruthy();
            expect(screen.getByText('Helper text')).toHaveAttribute('id', helperId!);
        });

        it('does not have aria-describedby when no helper text', () => {
            render(<Checkbox label="Test" />);
            const checkbox = screen.getByRole('checkbox');
            expect(checkbox).not.toHaveAttribute('aria-describedby');
        });

        it('sets aria-invalid when error is true', () => {
            render(<Checkbox error />);
            const checkbox = screen.getByRole('checkbox');
            expect(checkbox).toHaveAttribute('aria-invalid', 'true');
        });

        it('is keyboard accessible', async () => {
            const user = userEvent.setup();
            render(<Checkbox label="Test" />);
            const checkbox = screen.getByRole('checkbox');

            await user.tab();
            expect(checkbox).toHaveFocus();
        });
    });

    describe('Interaction', () => {
        it('can be checked and unchecked', async () => {
            const user = userEvent.setup();
            render(<Checkbox label="Test" />);
            const checkbox = screen.getByRole('checkbox') as HTMLInputElement;

            expect(checkbox.checked).toBe(false);

            await user.click(checkbox);
            expect(checkbox.checked).toBe(true);

            await user.click(checkbox);
            expect(checkbox.checked).toBe(false);
        });

        it('calls onChange handler', async () => {
            const user = userEvent.setup();
            const handleChange = jest.fn();
            render(<Checkbox label="Test" onChange={handleChange} />);
            const checkbox = screen.getByRole('checkbox');

            await user.click(checkbox);
            expect(handleChange).toHaveBeenCalledTimes(1);
        });

        it('can be checked via label click', async () => {
            const user = userEvent.setup();
            render(<Checkbox label="Click me" />);
            const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
            const label = screen.getByText('Click me');

            await user.click(label);
            expect(checkbox.checked).toBe(true);
        });

        it('respects disabled state', async () => {
            const user = userEvent.setup();
            const handleChange = jest.fn();
            render(<Checkbox label="Test" disabled onChange={handleChange} />);
            const checkbox = screen.getByRole('checkbox');

            await user.click(checkbox);
            expect(handleChange).not.toHaveBeenCalled();
            expect(checkbox).toBeDisabled();
        });

        it('applies disabled styles', () => {
            render(<Checkbox label="Test" disabled />);
            const checkbox = screen.getByRole('checkbox');
            expect(checkbox).toHaveClass('disabled:cursor-not-allowed', 'disabled:opacity-50');
        });
    });

    describe('Controlled Component', () => {
        it('works as controlled component', () => {
            const { rerender } = render(<Checkbox label="Test" checked={false} onChange={() => { }} />);
            const checkbox = screen.getByRole('checkbox') as HTMLInputElement;

            expect(checkbox.checked).toBe(false);

            rerender(<Checkbox label="Test" checked={true} onChange={() => { }} />);
            expect(checkbox.checked).toBe(true);
        });

        it('respects defaultChecked for uncontrolled component', () => {
            render(<Checkbox label="Test" defaultChecked />);
            const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
            expect(checkbox.checked).toBe(true);
        });
    });

    describe('Custom Styling', () => {
        it('applies custom className', () => {
            render(<Checkbox className="custom-class" />);
            const checkbox = screen.getByRole('checkbox');
            expect(checkbox).toHaveClass('custom-class');
        });

        it('merges custom className with default classes', () => {
            render(<Checkbox className="custom-class" />);
            const checkbox = screen.getByRole('checkbox');
            expect(checkbox).toHaveClass('custom-class');
            expect(checkbox).toHaveClass('h-4', 'w-4', 'rounded');
        });
    });

    describe('Ref Forwarding', () => {
        it('forwards ref to input element', () => {
            const ref = { current: null as HTMLInputElement | null };
            render(<Checkbox ref={ref} />);

            expect(ref.current).toBeInstanceOf(HTMLInputElement);
            expect(ref.current?.type).toBe('checkbox');
        });

        it('can focus via ref', () => {
            const ref = { current: null as HTMLInputElement | null };
            render(<Checkbox ref={ref} label="Test" />);

            ref.current?.focus();
            expect(ref.current).toHaveFocus();
        });
    });

    describe('Edge Cases', () => {
        it('handles empty string label', () => {
            render(<Checkbox label="" />);
            const checkbox = screen.getByRole('checkbox');
            expect(checkbox).toBeInTheDocument();
        });

        it('handles empty string helper text', () => {
            const { container } = render(<Checkbox label="Test" helperText="" />);
            const checkbox = screen.getByRole('checkbox');
            // Empty helper text should not create aria-describedby
            expect(checkbox).not.toHaveAttribute('aria-describedby');
            // Should not render a helper text element
            const helperElements = container.querySelectorAll('p');
            expect(helperElements.length).toBe(0);
        });

        it('handles multiple checkboxes with unique IDs', () => {
            render(
                <>
                    <Checkbox label="First" />
                    <Checkbox label="Second" />
                    <Checkbox label="Third" />
                </>
            );

            const checkboxes = screen.getAllByRole('checkbox');
            const ids = checkboxes.map(cb => cb.id);

            expect(new Set(ids).size).toBe(3); // All IDs are unique
        });
    });
});
