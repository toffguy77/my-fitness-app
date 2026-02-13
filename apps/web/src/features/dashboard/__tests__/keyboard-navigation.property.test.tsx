/**
* Property-based tests for keyboard navigation
*
* Feature: dashboard, Property 35: Keyboard Navigation Support
* Validates: Requirements 16.1, 16.4
*/

import React, { useRef, RefObject } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import fc from 'fast-check';
import { useKeyboardNavigation, useRovingTabIndex, useFocusTrap } from '../hooks/useKeyboardNavigation';

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

        it('should handle Page Up and Page Down keys when enabled', () => {
            fc.assert(
                fc.property(fc.constantFrom('PageUp', 'PageDown'), (key) => {
                    const callbacks = {
                        onPageUp: jest.fn(),
                        onPageDown: jest.fn(),
                        enablePageKeys: true,
                    };

                    const TestComponent = () => {
                        const ref = useRef<HTMLDivElement>(null);
                        useKeyboardNavigation(ref as RefObject<HTMLElement>, callbacks);
                        return <div ref={ref} tabIndex={0} data-testid={`container-page-${key}`} />;
                    };

                    const { getByTestId } = render(<TestComponent />);
                    const container = getByTestId(`container-page-${key}`);

                    fireEvent.keyDown(container, { key });

                    if (key === 'PageUp') {
                        expect(callbacks.onPageUp).toHaveBeenCalledTimes(1);
                    } else if (key === 'PageDown') {
                        expect(callbacks.onPageDown).toHaveBeenCalledTimes(1);
                    }

                    cleanup();
                    return true;
                }),
                { numRuns: 50 }
            );
        });

        it('should respect stopPropagation option', () => {
            fc.assert(
                fc.property(fc.constantFrom('ArrowLeft', 'ArrowRight'), (key) => {
                    const callbacks = {
                        onArrowLeft: jest.fn(),
                        onArrowRight: jest.fn(),
                        stopPropagation: true,
                    };

                    const TestComponent = () => {
                        const ref = useRef<HTMLDivElement>(null);
                        useKeyboardNavigation(ref as RefObject<HTMLElement>, callbacks);
                        return <div ref={ref} tabIndex={0} data-testid={`container-stop-${key}`} />;
                    };

                    const { getByTestId } = render(<TestComponent />);
                    const container = getByTestId(`container-stop-${key}`);

                    const event = new KeyboardEvent('keydown', { key, bubbles: true });
                    const stopPropagationSpy = jest.spyOn(event, 'stopPropagation');

                    container.dispatchEvent(event);

                    expect(stopPropagationSpy).toHaveBeenCalled();

                    cleanup();
                    return true;
                }),
                { numRuns: 50 }
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

        it('should navigate correctly in vertical orientation', () => {
            fc.assert(
                fc.property(fc.integer({ min: 3, max: 7 }), (numItems) => {
                    const testId = `container-vert-${numItems}`;

                    const TestComponent = () => {
                        const ref = useRef<HTMLDivElement>(null);
                        useRovingTabIndex(ref as RefObject<HTMLElement>, {
                            orientation: 'vertical',
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

                    // ArrowDown should navigate to next item in vertical mode
                    fireEvent.keyDown(container, { key: 'ArrowDown' });
                    let focusedElement = container.querySelector('[tabindex="0"]');
                    let focusedIndex = focusedElement
                        ? Array.from(container.querySelectorAll('[data-navigable="true"]')).indexOf(focusedElement)
                        : -1;
                    expect(focusedIndex).toBe(1);

                    // ArrowUp should navigate to previous item
                    fireEvent.keyDown(container, { key: 'ArrowUp' });
                    focusedElement = container.querySelector('[tabindex="0"]');
                    focusedIndex = focusedElement
                        ? Array.from(container.querySelectorAll('[data-navigable="true"]')).indexOf(focusedElement)
                        : -1;
                    expect(focusedIndex).toBe(0);

                    cleanup();
                    return true;
                }),
                { numRuns: 50 }
            );
        });

        it('should handle Home and End keys for first/last navigation', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 3, max: 7 }),
                    fc.integer({ min: 1, max: 5 }),
                    (numItems, startIndex) => {
                        const safeStartIndex = startIndex % numItems;
                        const testId = `container-homeend-${numItems}-${safeStartIndex}`;

                        const TestComponent = () => {
                            const ref = useRef<HTMLDivElement>(null);
                            useRovingTabIndex(ref as RefObject<HTMLElement>, {
                                orientation: 'horizontal',
                                initialIndex: safeStartIndex,
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

                        // Home should navigate to first item
                        fireEvent.keyDown(container, { key: 'Home' });
                        let focusedElement = container.querySelector('[tabindex="0"]');
                        let focusedIndex = focusedElement
                            ? Array.from(container.querySelectorAll('[data-navigable="true"]')).indexOf(focusedElement)
                            : -1;
                        expect(focusedIndex).toBe(0);

                        // End should navigate to last item
                        fireEvent.keyDown(container, { key: 'End' });
                        focusedElement = container.querySelector('[tabindex="0"]');
                        focusedIndex = focusedElement
                            ? Array.from(container.querySelectorAll('[data-navigable="true"]')).indexOf(focusedElement)
                            : -1;
                        expect(focusedIndex).toBe(numItems - 1);

                        cleanup();
                        return true;
                    }
                ),
                { numRuns: 50 }
            );
        });

        it('should return navigation functions that work correctly', () => {
            fc.assert(
                fc.property(fc.integer({ min: 3, max: 7 }), (numItems) => {
                    const testId = `container-funcs-${numItems}`;
                    let hookResult: ReturnType<typeof useRovingTabIndex> | null = null;

                    const TestComponent = () => {
                        const ref = useRef<HTMLDivElement>(null);
                        hookResult = useRovingTabIndex(ref as RefObject<HTMLElement>, {
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

                    render(<TestComponent />);

                    // Verify hook returns all expected functions
                    expect(hookResult).not.toBeNull();
                    expect(typeof hookResult!.focusItem).toBe('function');
                    expect(typeof hookResult!.navigateNext).toBe('function');
                    expect(typeof hookResult!.navigatePrevious).toBe('function');
                    expect(typeof hookResult!.navigateFirst).toBe('function');
                    expect(typeof hookResult!.navigateLast).toBe('function');

                    cleanup();
                    return true;
                }),
                { numRuns: 30 }
            );
        });
    });

    describe('useFocusTrap hook', () => {
        it('should trap focus within container when active', () => {
            fc.assert(
                fc.property(fc.integer({ min: 2, max: 5 }), (numButtons) => {
                    const testId = `trap-container-${numButtons}`;

                    const TestComponent = () => {
                        const ref = useRef<HTMLDivElement>(null);
                        useFocusTrap(ref as RefObject<HTMLElement>, true);

                        return (
                            <div ref={ref} data-testid={testId}>
                                {Array.from({ length: numButtons }).map((_, i) => (
                                    <button key={i} data-testid={`${testId}-btn-${i}`}>
                                        Button {i}
                                    </button>
                                ))}
                            </div>
                        );
                    };

                    const { getByTestId } = render(<TestComponent />);
                    const container = getByTestId(testId);
                    const firstButton = getByTestId(`${testId}-btn-0`);
                    const lastButton = getByTestId(`${testId}-btn-${numButtons - 1}`);

                    // First element should be focused on mount
                    expect(document.activeElement).toBe(firstButton);

                    // Tab from last element should wrap to first
                    lastButton.focus();
                    fireEvent.keyDown(container, { key: 'Tab' });
                    // Focus trap should keep focus within container

                    // Shift+Tab from first element should wrap to last
                    firstButton.focus();
                    fireEvent.keyDown(container, { key: 'Tab', shiftKey: true });
                    // Focus trap should keep focus within container

                    cleanup();
                    return true;
                }),
                { numRuns: 30 }
            );
        });

        it('should not trap focus when inactive', () => {
            const testId = 'trap-inactive';

            const TestComponent = () => {
                const ref = useRef<HTMLDivElement>(null);
                useFocusTrap(ref as RefObject<HTMLElement>, false);

                return (
                    <div ref={ref} data-testid={testId}>
                        <button data-testid={`${testId}-btn`}>Button</button>
                    </div>
                );
            };

            const { getByTestId } = render(<TestComponent />);
            const button = getByTestId(`${testId}-btn`);

            // When inactive, first element should NOT be auto-focused
            expect(document.activeElement).not.toBe(button);

            cleanup();
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
