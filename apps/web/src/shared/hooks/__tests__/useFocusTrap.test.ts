/**
 * Тесты ловушки фокуса.
 *
 * Переехали вместе с хуком из `features/dashboard/hooks/__tests__`.
 */

import { renderHook } from '@testing-library/react';
import { useFocusTrap } from '../useFocusTrap';

describe('useFocusTrap', () => {
    let container: HTMLDivElement;
    let buttons: HTMLButtonElement[];

    beforeEach(() => {
        container = document.createElement('div');
        buttons = [];

        for (let i = 0; i < 3; i++) {
            const button = document.createElement('button');
            button.textContent = `Button ${i}`;
            container.appendChild(button);
            buttons.push(button);
        }

        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.removeChild(container);
    });

    it('should focus first element on mount when active', () => {
        const ref = { current: container };

        renderHook(() => useFocusTrap(ref, true));

        // На этом держится диалог подтверждения: первой в разметке стоит
        // кнопка отказа, и фокус при открытии обязан попасть на неё.
        expect(document.activeElement).toBe(buttons[0]);
    });

    it('should not trap focus when inactive', () => {
        const ref = { current: container };

        renderHook(() => useFocusTrap(ref, false));

        expect(document.activeElement).not.toBe(buttons[0]);

        // Tab не перехватывается: событие проходит браузеру как есть.
        buttons[2].focus();
        const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
        const preventDefaultSpy = jest.spyOn(event, 'preventDefault');
        container.dispatchEvent(event);

        expect(preventDefaultSpy).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(buttons[2]);
    });

    it('should handle Tab key to trap focus', () => {
        const ref = { current: container };

        renderHook(() => useFocusTrap(ref, true));

        // Simulate Tab key
        const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
        const preventDefaultSpy = jest.spyOn(event, 'preventDefault');

        // Focus last button and press Tab: the trap wraps round to the first
        buttons[2].focus();
        container.dispatchEvent(event);

        expect(preventDefaultSpy).toHaveBeenCalled();
        expect(document.activeElement).toBe(buttons[0]);
    });

    it('should handle Shift+Tab key to trap focus backwards', () => {
        const ref = { current: container };

        renderHook(() => useFocusTrap(ref, true));

        // Simulate Shift+Tab key
        const event = new KeyboardEvent('keydown', {
            key: 'Tab',
            shiftKey: true,
            bubbles: true,
        });

        // Focus first button and press Shift+Tab: the trap wraps to the last
        const preventDefaultSpy = jest.spyOn(event, 'preventDefault');
        buttons[0].focus();
        container.dispatchEvent(event);

        expect(preventDefaultSpy).toHaveBeenCalled();
        expect(document.activeElement).toBe(buttons[2]);
    });
});
