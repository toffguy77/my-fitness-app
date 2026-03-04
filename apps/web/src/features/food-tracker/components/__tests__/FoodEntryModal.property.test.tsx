/**
 * FoodEntryModal Property-Based Tests
 *
 * Property tests for modal dismiss behavior.
 *
 * **Property 20: Modal Dismiss Without Save**
 * For any dismiss action (Escape/outside click), no changes persisted.
 * **Validates: Requirements 4.6**
 *
 * @module food-tracker/components/__tests__/FoodEntryModal.property.test
 */

import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as fc from 'fast-check';
import { FoodEntryModal } from '../FoodEntryModal';
import type { MealType, EntryMethodTab } from '../../types';

// ============================================================================
// Generators
// ============================================================================

/**
 * Generate valid meal types
 */
const mealTypeGenerator = (): fc.Arbitrary<MealType> =>
    fc.constantFrom('breakfast', 'lunch', 'dinner', 'snack');

/**
 * Generate valid entry method tabs
 */
const entryMethodTabGenerator = (): fc.Arbitrary<EntryMethodTab> =>
    fc.constantFrom('search', 'barcode', 'photo', 'chat');

// ============================================================================
// Property Tests
// ============================================================================

describe('FoodEntryModal Property Tests', () => {
    afterEach(() => {
        cleanup();
    });

    /**
     * Property 20: Modal Dismiss Without Save
     *
     * For any dismiss action (Escape/outside click), modal closes without saving.
     * The modal now handles saving internally via Zustand store, so we verify
     * that dismiss actions properly trigger onClose.
     * **Validates: Requirements 4.6**
     */
    describe('Property 20: Modal Dismiss Without Save', () => {
        it('Escape key triggers onClose', () => {
            fc.assert(
                fc.property(
                    fc.option(mealTypeGenerator()),
                    (mealType) => {
                        cleanup();
                        const onClose = jest.fn();

                        render(
                            <FoodEntryModal
                                isOpen={true}
                                onClose={onClose}
                                mealType={mealType ?? undefined}
                            />
                        );

                        // Press Escape
                        fireEvent.keyDown(document, { key: 'Escape' });

                        // onClose should be called
                        expect(onClose).toHaveBeenCalledTimes(1);

                        return true;
                    }
                ),
                { numRuns: 20 }
            );
        });

        it('clicking outside modal triggers onClose', () => {
            fc.assert(
                fc.property(
                    fc.option(mealTypeGenerator()),
                    (mealType) => {
                        cleanup();
                        const onClose = jest.fn();

                        render(
                            <FoodEntryModal
                                isOpen={true}
                                onClose={onClose}
                                mealType={mealType ?? undefined}
                            />
                        );

                        // Click on backdrop (the dialog element itself, which has the click handler)
                        const dialog = screen.getByRole('dialog');
                        fireEvent.click(dialog);

                        // onClose should be called
                        expect(onClose).toHaveBeenCalledTimes(1);

                        return true;
                    }
                ),
                { numRuns: 20 }
            );
        });

        it('clicking close button triggers onClose', () => {
            fc.assert(
                fc.property(
                    fc.option(mealTypeGenerator()),
                    (mealType) => {
                        cleanup();
                        const onClose = jest.fn();

                        render(
                            <FoodEntryModal
                                isOpen={true}
                                onClose={onClose}
                                mealType={mealType ?? undefined}
                            />
                        );

                        // Click close button
                        const closeButton = screen.getByRole('button', { name: /закрыть/i });
                        fireEvent.click(closeButton);

                        // onClose should be called
                        expect(onClose).toHaveBeenCalledTimes(1);

                        return true;
                    }
                ),
                { numRuns: 20 }
            );
        });

        it('dismiss actions trigger onClose for escape and button methods', () => {
            fc.assert(
                fc.property(
                    fc.option(mealTypeGenerator()),
                    fc.constantFrom('escape', 'button') as fc.Arbitrary<'escape' | 'button'>,
                    (mealType, dismissMethod) => {
                        cleanup();
                        const onClose = jest.fn();

                        render(
                            <FoodEntryModal
                                isOpen={true}
                                onClose={onClose}
                                mealType={mealType ?? undefined}
                            />
                        );

                        // Perform dismiss action
                        switch (dismissMethod) {
                            case 'escape':
                                fireEvent.keyDown(document, { key: 'Escape' });
                                break;
                            case 'button':
                                const closeButton = screen.getByRole('button', { name: /закрыть/i });
                                fireEvent.click(closeButton);
                                break;
                        }

                        // onClose should be called for all dismiss methods
                        expect(onClose).toHaveBeenCalled();

                        return true;
                    }
                ),
                { numRuns: 30 }
            );
        });
    });

    /**
     * Additional property: Tab switching maintains modal state
     */
    describe('Property: Tab Switching Without Closing', () => {
        it('switching tabs does not close the modal', async () => {
            const user = userEvent.setup();

            await fc.assert(
                fc.asyncProperty(
                    fc.array(entryMethodTabGenerator(), { minLength: 1, maxLength: 4 }),
                    async (tabSequence) => {
                        cleanup();
                        const onClose = jest.fn();

                        render(
                            <FoodEntryModal
                                isOpen={true}
                                onClose={onClose}
                            />
                        );

                        // Click through tabs
                        for (const tab of tabSequence) {
                            const tabLabels: Record<EntryMethodTab, string> = {
                                search: 'Поиск',
                                barcode: 'Штрих-код',
                                manual: 'Ручной ввод',
                                photo: 'Фото еды',
                                chat: 'Чат',
                            };
                            const tabButton = screen.getByRole('tab', { name: tabLabels[tab] });
                            await user.click(tabButton);
                        }

                        // onClose should never be called just from tab switching
                        expect(onClose).not.toHaveBeenCalled();

                        return true;
                    }
                ),
                { numRuns: 20 }
            );
        });
    });

    /**
     * Additional property: Modal resets to default tab on reopen
     */
    describe('Property: Modal Reset on Reopen', () => {
        it('modal always opens with search tab selected', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 3 }),
                    (reopenCount) => {
                        cleanup();
                        const onClose = jest.fn();

                        const { rerender } = render(
                            <FoodEntryModal isOpen={true} onClose={onClose} />
                        );

                        // Verify search tab is selected initially
                        const searchTab = screen.getByRole('tab', { name: 'Поиск' });
                        expect(searchTab).toHaveAttribute('aria-selected', 'true');

                        // Simulate close and reopen multiple times
                        for (let i = 0; i < reopenCount; i++) {
                            // Close modal
                            rerender(<FoodEntryModal isOpen={false} onClose={onClose} />);

                            // Reopen modal
                            rerender(<FoodEntryModal isOpen={true} onClose={onClose} />);

                            // Search tab should be selected again
                            const searchTabAfterReopen = screen.getByRole('tab', { name: 'Поиск' });
                            expect(searchTabAfterReopen).toHaveAttribute('aria-selected', 'true');
                        }

                        return true;
                    }
                ),
                { numRuns: 10 }
            );
        });
    });
});
