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
     * For any dismiss action (Escape/outside click), no changes persisted.
     * **Validates: Requirements 4.6**
     */
    describe('Property 20: Modal Dismiss Without Save', () => {
        it('Escape key triggers onClose without calling onSave', () => {
            fc.assert(
                fc.property(
                    fc.option(mealTypeGenerator()),
                    (mealType) => {
                        cleanup();
                        const onClose = jest.fn();
                        const onSave = jest.fn();

                        render(
                            <FoodEntryModal
                                isOpen={true}
                                onClose={onClose}
                                onSave={onSave}
                                mealType={mealType ?? undefined}
                            />
                        );

                        // Press Escape
                        fireEvent.keyDown(document, { key: 'Escape' });

                        // onClose should be called
                        expect(onClose).toHaveBeenCalledTimes(1);
                        // onSave should NOT be called
                        expect(onSave).not.toHaveBeenCalled();

                        return true;
                    }
                ),
                { numRuns: 20 }
            );
        });

        it('clicking outside modal triggers onClose without calling onSave', () => {
            fc.assert(
                fc.property(
                    fc.option(mealTypeGenerator()),
                    (mealType) => {
                        cleanup();
                        const onClose = jest.fn();
                        const onSave = jest.fn();

                        render(
                            <FoodEntryModal
                                isOpen={true}
                                onClose={onClose}
                                onSave={onSave}
                                mealType={mealType ?? undefined}
                            />
                        );

                        // Click on backdrop (the dialog element itself, which has the click handler)
                        const dialog = screen.getByRole('dialog');
                        fireEvent.click(dialog);

                        // onClose should be called
                        expect(onClose).toHaveBeenCalledTimes(1);
                        // onSave should NOT be called
                        expect(onSave).not.toHaveBeenCalled();

                        return true;
                    }
                ),
                { numRuns: 20 }
            );
        });

        it('clicking close button triggers onClose without calling onSave', () => {
            fc.assert(
                fc.property(
                    fc.option(mealTypeGenerator()),
                    (mealType) => {
                        cleanup();
                        const onClose = jest.fn();
                        const onSave = jest.fn();

                        render(
                            <FoodEntryModal
                                isOpen={true}
                                onClose={onClose}
                                onSave={onSave}
                                mealType={mealType ?? undefined}
                            />
                        );

                        // Click close button
                        const closeButton = screen.getByRole('button', { name: /закрыть/i });
                        fireEvent.click(closeButton);

                        // onClose should be called
                        expect(onClose).toHaveBeenCalledTimes(1);
                        // onSave should NOT be called
                        expect(onSave).not.toHaveBeenCalled();

                        return true;
                    }
                ),
                { numRuns: 20 }
            );
        });

        it('dismiss actions do not persist any state changes', () => {
            fc.assert(
                fc.property(
                    fc.option(mealTypeGenerator()),
                    fc.constantFrom('escape', 'backdrop', 'button') as fc.Arbitrary<'escape' | 'backdrop' | 'button'>,
                    (mealType, dismissMethod) => {
                        cleanup();
                        const onClose = jest.fn();
                        const onSave = jest.fn();
                        let savedData: unknown = null;

                        const trackingSave = (data: unknown) => {
                            savedData = data;
                            onSave(data);
                        };

                        render(
                            <FoodEntryModal
                                isOpen={true}
                                onClose={onClose}
                                onSave={trackingSave}
                                mealType={mealType ?? undefined}
                            />
                        );

                        // Perform dismiss action
                        switch (dismissMethod) {
                            case 'escape':
                                fireEvent.keyDown(document, { key: 'Escape' });
                                break;
                            case 'backdrop':
                                const backdrop = screen.getByRole('dialog').parentElement;
                                if (backdrop) fireEvent.click(backdrop);
                                break;
                            case 'button':
                                const closeButton = screen.getByRole('button', { name: /закрыть/i });
                                fireEvent.click(closeButton);
                                break;
                        }

                        // No data should be saved
                        expect(savedData).toBeNull();
                        expect(onSave).not.toHaveBeenCalled();

                        return true;
                    }
                ),
                { numRuns: 30 }
            );
        });
    });

    /**
     * Additional property: Tab switching does not trigger save
     */
    describe('Property: Tab Switching Without Save', () => {
        it('switching tabs does not trigger onSave', async () => {
            const user = userEvent.setup();

            await fc.assert(
                fc.asyncProperty(
                    fc.array(entryMethodTabGenerator(), { minLength: 1, maxLength: 4 }),
                    async (tabSequence) => {
                        cleanup();
                        const onClose = jest.fn();
                        const onSave = jest.fn();

                        render(
                            <FoodEntryModal
                                isOpen={true}
                                onClose={onClose}
                                onSave={onSave}
                            />
                        );

                        // Click through tabs
                        for (const tab of tabSequence) {
                            const tabLabels: Record<EntryMethodTab, string> = {
                                search: 'Поиск',
                                barcode: 'Штрих-код',
                                photo: 'Фото еды',
                                chat: 'Чат',
                            };
                            const tabButton = screen.getByRole('tab', { name: tabLabels[tab] });
                            await user.click(tabButton);
                        }

                        // onSave should never be called just from tab switching
                        expect(onSave).not.toHaveBeenCalled();

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
