/**
 * KeyboardShortcutsHelp component
 *
 * Displays keyboard shortcuts help dialog for dashboard navigation.
 * Can be toggled with '?' key.
 *
 * Requirements: 16.1, 16.4
 */

'use client';

import { useState, useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { cn } from '@/shared/utils/cn';

/**
 * Keyboard shortcut definition
 */
interface KeyboardShortcut {
    keys: string[];
    description: string;
    category: string;
}

/**
 * All available keyboard shortcuts
 */
const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
    // Calendar navigation
    {
        keys: ['←', '→'],
        description: 'Навигация между днями недели',
        category: 'Календарь',
    },
    {
        keys: ['Home'],
        description: 'Перейти к понедельнику',
        category: 'Календарь',
    },
    {
        keys: ['End'],
        description: 'Перейти к воскресенью',
        category: 'Календарь',
    },
    {
        keys: ['Enter'],
        description: 'Выбрать день',
        category: 'Календарь',
    },

    // General navigation
    {
        keys: ['Tab'],
        description: 'Перейти к следующему элементу',
        category: 'Навигация',
    },
    {
        keys: ['Shift', 'Tab'],
        description: 'Перейти к предыдущему элементу',
        category: 'Навигация',
    },
    {
        keys: ['Esc'],
        description: 'Закрыть диалог или отменить действие',
        category: 'Навигация',
    },

    // Data entry
    {
        keys: ['Enter'],
        description: 'Сохранить данные',
        category: 'Ввод данных',
    },
    {
        keys: ['Esc'],
        description: 'Отменить редактирование',
        category: 'Ввод данных',
    },

    // Help
    {
        keys: ['?'],
        description: 'Показать/скрыть эту справку',
        category: 'Справка',
    },
];

/**
 * Group shortcuts by category
 */
function groupShortcutsByCategory(shortcuts: KeyboardShortcut[]) {
    const grouped: Record<string, KeyboardShortcut[]> = {};

    shortcuts.forEach((shortcut) => {
        if (!grouped[shortcut.category]) {
            grouped[shortcut.category] = [];
        }
        grouped[shortcut.category].push(shortcut);
    });

    return grouped;
}

/**
 * KeyboardShortcutsHelp component
 */
export function KeyboardShortcutsHelp() {
    const [isOpen, setIsOpen] = useState(false);

    // Toggle help with '?' key
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey) {
                // Don't trigger if user is typing in an input
                const target = event.target as HTMLElement;
                if (
                    target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.isContentEditable
                ) {
                    return;
                }

                event.preventDefault();
                setIsOpen((prev) => !prev);
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    // Close on Escape
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-4 right-4 p-3 bg-gray-800 text-white rounded-full shadow-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 z-50"
                aria-label="Показать горячие клавиши"
                title="Горячие клавиши (?)"
            >
                <Keyboard className="h-5 w-5" />
            </button>
        );
    }

    const groupedShortcuts = groupShortcutsByCategory(KEYBOARD_SHORTCUTS);

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black bg-opacity-50 z-50"
                onClick={() => setIsOpen(false)}
                aria-hidden="true"
            />

            {/* Dialog */}
            <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
                role="dialog"
                aria-modal="true"
                aria-labelledby="keyboard-shortcuts-title"
            >
                <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b">
                        <div className="flex items-center gap-3">
                            <Keyboard className="h-6 w-6 text-gray-700" />
                            <h2
                                id="keyboard-shortcuts-title"
                                className="text-xl font-semibold text-gray-900"
                            >
                                Горячие клавиши
                            </h2>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-2 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            aria-label="Закрыть"
                        >
                            <X className="h-5 w-5 text-gray-500" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6">
                        <div className="space-y-6">
                            {Object.entries(groupedShortcuts).map(([category, shortcuts]) => (
                                <div key={category}>
                                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                                        {category}
                                    </h3>
                                    <div className="space-y-2">
                                        {shortcuts.map((shortcut, index) => (
                                            <div
                                                key={index}
                                                className="flex items-center justify-between py-2"
                                            >
                                                <span className="text-sm text-gray-600">
                                                    {shortcut.description}
                                                </span>
                                                <div className="flex items-center gap-1">
                                                    {shortcut.keys.map((key, keyIndex) => (
                                                        <span key={keyIndex} className="flex items-center gap-1">
                                                            <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-300 rounded">
                                                                {key}
                                                            </kbd>
                                                            {keyIndex < shortcut.keys.length - 1 && (
                                                                <span className="text-gray-400">+</span>
                                                            )}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t bg-gray-50">
                        <p className="text-sm text-gray-600 text-center">
                            Нажмите <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-white border border-gray-300 rounded">?</kbd> чтобы показать или скрыть эту справку
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
}
