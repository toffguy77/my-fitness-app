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
import { IconButton } from '@/shared/components/ui/Button';
import { t } from '@/shared/i18n'

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
        description: t('dashboard.shortcuts.betweenDays'),
        category: t('dashboard.shortcuts.categoryCalendar'),
    },
    {
        keys: ['Home'],
        description: t('dashboard.shortcuts.toMonday'),
        category: t('dashboard.shortcuts.categoryCalendar'),
    },
    {
        keys: ['End'],
        description: t('dashboard.shortcuts.toSunday'),
        category: t('dashboard.shortcuts.categoryCalendar'),
    },
    {
        keys: ['Enter'],
        description: t('dashboard.shortcuts.pickDay'),
        category: t('dashboard.shortcuts.categoryCalendar'),
    },

    // General navigation
    {
        keys: ['Tab'],
        description: t('dashboard.shortcuts.nextItem'),
        category: t('dashboard.shortcuts.categoryNavigation'),
    },
    {
        keys: ['Shift', 'Tab'],
        description: t('dashboard.shortcuts.previousItem'),
        category: t('dashboard.shortcuts.categoryNavigation'),
    },
    {
        keys: ['Esc'],
        description: t('dashboard.shortcuts.closeDialog'),
        category: t('dashboard.shortcuts.categoryNavigation'),
    },

    // Data entry
    {
        keys: ['Enter'],
        description: t('dashboard.shortcuts.save'),
        category: t('dashboard.shortcuts.categoryInput'),
    },
    {
        keys: ['Esc'],
        description: t('dashboard.shortcuts.cancelEditing'),
        category: t('dashboard.shortcuts.categoryInput'),
    },

    // Help
    {
        keys: ['?'],
        description: t('dashboard.shortcuts.toggleHelp'),
        category: t('dashboard.shortcuts.categoryHelp'),
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
            <IconButton
                variant="ghost"
                size="lg"
                onClick={() => setIsOpen(true)}
                className="fixed bottom-4 right-4 z-50 bg-fg text-fg-inverse shadow-float hover:bg-fg hover:opacity-90"
                aria-label={t('dashboard.shortcuts.showAria')}
                title={t('dashboard.shortcuts.showTitle')}
            >
                <Keyboard className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
            </IconButton>
        );
    }

    const groupedShortcuts = groupShortcutsByCategory(KEYBOARD_SHORTCUTS);

    // Модальное окно по рецепту системы: затемнение `bg-scrim`, шторка снизу
    // на телефоне и окно по центру на десктопе, заголовок засечками.
    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-50 bg-scrim"
                onClick={() => setIsOpen(false)}
                aria-hidden="true"
            />

            {/* Dialog */}
            <div
                className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
                role="dialog"
                aria-modal="true"
                aria-labelledby="keyboard-shortcuts-title"
            >
                <div className="pointer-events-auto flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-sheet bg-surface text-fg shadow-overlay sm:max-w-2xl sm:rounded-sheet">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-3 border-b border-line py-3 pl-5 pr-3">
                        <h2
                            id="keyboard-shortcuts-title"
                            className="type-title-2 text-fg"
                        >
                            {t('dashboard.shortcuts.title')}
                        </h2>
                        <IconButton
                            variant="ghost"
                            onClick={() => setIsOpen(false)}
                            aria-label={t('common.close')}
                        >
                            <X className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                        </IconButton>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto px-5 py-4">
                        <div className="space-y-5">
                            {Object.entries(groupedShortcuts).map(([category, shortcuts]) => (
                                <div key={category}>
                                    <h3 className="mb-1 type-overline text-fg-subtle">
                                        {category}
                                    </h3>
                                    <div className="divide-y divide-line">
                                        {shortcuts.map((shortcut, index) => (
                                            <div
                                                key={index}
                                                className="flex min-h-11 items-center justify-between gap-4 py-2"
                                            >
                                                <span className="text-sm text-fg">
                                                    {shortcut.description}
                                                </span>
                                                <div className="flex flex-shrink-0 items-center gap-1">
                                                    {shortcut.keys.map((key, keyIndex) => (
                                                        <span key={keyIndex} className="flex items-center gap-1">
                                                            <kbd className="inline-flex h-7 min-w-7 items-center justify-center rounded-field border border-line bg-subtle px-2 font-sans text-xs font-semibold text-fg">
                                                                {key}
                                                            </kbd>
                                                            {keyIndex < shortcut.keys.length - 1 && (
                                                                <span className="text-fg-subtle">+</span>
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
                    <div className="border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                        <p className="text-center type-caption text-fg-muted">
                            {t('dashboard.shortcuts.pressHint', { key: '?' })}
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
}
