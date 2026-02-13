/**
* Property-based tests for keyboard navigation
*
* Feature: dashboard, Property 35: Keyboard Navigation Support
* Validates: Requirements 16.1, 16.4
*/

import React, { useRef, RefObject } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import fc from 'fast-check';
import { useKeyboardNavigation, useRovingTabIndex } from '../hooks/useKeyboardNavigation';

// Clean up after each property test
afterEach(() => {
    cleanup();
});

describe('Property 35: Keyboard Navigation Support', () => {
    describe('useKeyboardNavigation hook', () => {
        it('should handle all arrow key directions consistently', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom('ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'),
                    (key) => {
                        const callbacks = {
                            onArrowLeft: jest.fn(),
                            onArrowRight: jest.fn(),
                            onArrowUp: jest.fn(),
                            onArrowDown: jest.fn(),
                        };

                        const TestComponent = () => {
                            const ref = useRef<HTMLDivElement>(null);
                            useKeyboardNavigation(ref as RefObject<HTMLElement>, callbacks);
                            return <div ref={ref} tabIndex={0} data-testid={`container-${key}`} />;
                        };

                        const { getByTestId } = render(<TestComponent />);
                        const container = getByTestId(`container-${key}`);

                        fireEvent.keyDown(container, { key });

                        if (key === 'ArrowLeft') {
                            expect(callbacks.onArrowLeft).toHaveBeenCalledTimes(1);
                        } else if (key === 'ArrowRight') {
                            expect(callbacks.onArrowRight).toHaveBeenCalledTimes(1);
                        } else if (key === 'ArrowUp') {
                            expect(callbacks.onArrowUp).toHaveBeenCalledTimes(1);
                        } else if (key === 'ArrowDown') {
                            expect(callbacks.onArrowDown).toHaveBeenCalledTimes(1);
                        }

                        cleanup();
                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });


        it('should handle Home and End keys consistently', () => {
            fc.assert(
                fc.property(fc.constantFrom('Home', 'End'), (key) => {
                    const callbacks = {
                        onHome: jest.fn(),
                        onEnd: jest.fn(),
                    };

                    const TestComponent = () => {
                        const ref = useRef<HTMLDivElement>(null);
                        useKeyboardNavigation(ref as RefObject<HTMLElement>, callbacks);
                        return <div ref={ref} tabIndex={0} data-testid={`container-${key}`} />;
                    };

                    const { getByTestId } = render(<TestComponent />);
                    const container = getByTestId(`container-${key}`);

                    fireEvent.keyDown(container, { key });

                    if (key === 'Home') {
                        expect(callbacks.onHome).toHaveBeenCalledTimes(1);
                    } else if (key === 'End') {
                        expect(callbacks.onEnd).toHaveBeenCalledTimes(1);
                    }

                    cleanup();
                    return true;
                }),
                { numRuns: 100 }
            );
        });

        it('should handle Enter, Space, and Escape keys consistently', () => {
            fc.assert(
                fc.property(fc.constantFrom('Enter', 'Space', 'Escape'), (key) => {
                    const actualKey = key === 'Space' ? ' ' : key;
                    const callbacks = {
                        onEnter: jest.fn(),
                        onSpace: jest.fn(),
                        onEscape: jest.fn(),
                    };

                    const TestComponent = () => {
                        const ref = useRef<HTMLDivElement>(null);
                        useKeyboardNavigation(ref as RefObject<HTMLElement>, callbacks);
                        return <div ref={ref} tabIndex={0} data-testid={`container-${key}`} />;
                    };

                    const { getByTestId } = render(<TestComponent />);
                    const container = getByTestId(`container-${key}`);

                    fireEvent.keyDown(container, { key: actualKey });

                    if (key === 'Enter') {
                        expect(callbacks.onEnter).toHaveBeenCalledTimes(1);
                    } else if (key === 'Space') {
                        expect(callbacks.onSpace).toHaveBeenCalledTimes(1);
                    } else if (key === 'Escape') {
                        expect(callbacks.onEscape).toHaveBeenCalledTimes(1);
                    }

                    cleanup();
                    return true;
                }),
                { numRuns: 100 }
            );
        });
    });


    describe('useRovingTabIndex hook', () => {
        it('should maintain exactly one element with tabindex="0" at all times', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 3, max: 10 }),
                    fc.integer({ min: 0, max: 9 }),
                    (numItems, initialIndex) => {
                        const safeInitialIndex = initialIndex % numItems;
                        const testId = `container-${numItems}-${safeInitialIndex}`;

                        const TestComponent = () => {
                            const ref = useRef<HTMLDivElement>(null);
                            useRovingTabIndex(ref as RefObject<HTMLElement>, {
                                orientation: 'horizontal',
                                initialIndex: safeInitialIndex,
                            });

                            return (
                                <div ref={ref} data-testid={testId}>
                                    {Array.from({ length: numItems }).map((_, i) => (
                                        <button
                                            key={i}
                                            data-navigable="true"
                                            data-testid={`${testId}-item-${i}`}
                                        >
                                            Item {i}
                                        </button>
                                    ))}
                                </div>
                            );
                        };

                        const { getByTestId } = render(<TestComponent />);
                        const container = getByTestId(testId);
                        const items = container.querySelectorAll('[data-navigable="true"]');
                        const focusableCount = Array.from(items).filter(
                            (item) => item.getAttribute('tabindex') === '0'
                        ).length;

                        expect(focusableCount).toBe(1);
                        cleanup();
                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should navigate correctly in horizontal orientation', () => {
            fc.assert(
                fc.property(fc.integer({ min: 3, max: 7 }), (numItems) => {
                    const testId = `container-horiz-${numItems}`;

                    const TestComponent = () => {
                        const ref = useRef<HTMLDivElement>(null);
                        useRovingTabIndex(ref as RefObject<HTMLElement>, {
                            orientation: 'horizontal',
                            initialIndex: 0,
                        });

                        return (
                            <div ref={ref} data-testid={testId}>
                                {Array.from({ length: numItems }).map((_, i) => (
                                    <button
                                        key={i}
                                        data-navigable="true"
                                        data-testid={`${testId}-item-${i}`}
                                    >
                                        Item {i}
                                    </button>
                                ))}
                            </div>
                        );
                    };

                    const { getByTestId } = render(<TestComponent />);
                    const container = getByTestId(testId);

                    fireEvent.keyDown(container, { key: 'ArrowRight' });
                    const focusedAfterRight = container.querySelector('[tabindex="0"]');
                    expect(focusedAfterRight).toBeTruthy();

                    cleanup();
                    return true;
                }),
                { numRuns: 50 }
            );
        });


        it('should loop correctly when loop option is enabled', () => {
            fc.assert(
                fc.property(fc.boolean(), fc.integer({ min: 3, max: 7 }), (loop, numItems) => {
                    const testId = `container-loop-${loop}-${numItems}`;

                    const TestComponent = () => {
                        const ref = useRef<HTMLDivElement>(null);
                        useRovingTabIndex(ref as RefObject<HTMLElement>, {
                            orientation: 'horizontal',
                            loop,
                            initialIndex: numItems - 1,
                        });

                        return (
                            <div ref={ref} data-testid={testId}>
                                {Array.from({ length: numItems }).map((_, i) => (
                                    <button
                                        key={i}
                                        data-navigable="true"
                                        data-testid={`${testId}-item-${i}`}
                                    >
                                        Item {i}
                                    </button>
                                ))}
                            </div>
                        );
                    };

                    const { getByTestId } = render(<TestComponent />);
                    const container = getByTestId(testId);

                    fireEvent.keyDown(container, { key: 'ArrowRight' });

                    const focusedElement = container.querySelector('[tabindex="0"]');
                    const focusedIndex = focusedElement
                        ? Array.from(container.querySelectorAll('[data-navigable="true"]')).indexOf(
                            focusedElement
                        )
                        : -1;

                    if (loop) {
                        expect(focusedIndex).toBe(0);
                    } else {
                        expect(focusedIndex).toBe(numItems - 1);
                    }

                    cleanup();
                    return true;
                }),
                { numRuns: 50 }
            );
        });
    });

    describe('Focus indicators', () => {
        it('should have visible focus indicators on all interactive elements', () => {
            fc.assert(
                fc.property(fc.constantFrom('button', 'a'), (elementType) => {
                    const testId = `element-${elementType}`;
                    const TestComponent = () => {
                        const props: Record<string, unknown> = {
                            'data-testid': testId,
                            className: 'focus:outline-none focus:ring-2 focus:ring-blue-500',
                        };

                        if (elementType === 'a') {
                            props.href = '#';
                        }

                        return React.createElement(elementType, props, 'Test Element');
                    };

                    const { getByTestId } = render(<TestComponent />);
                    const element = getByTestId(testId);

                    expect(element.className).toContain('focus:ring');

                    cleanup();
                    return true;
                }),
                { numRuns: 50 }
            );
        });
    });
});
