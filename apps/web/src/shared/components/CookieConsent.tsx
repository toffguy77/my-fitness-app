/**
 * Согласие на аналитические cookie.
 *
 * Яндекс.Метрика ставит свои cookie и отправляет данные о поведении. До этой
 * полосы она грузилась сразу при открытии страницы — согласия не спрашивали
 * ни у кого, хотя политика конфиденциальности обещает обратное.
 *
 * Полоса решает, грузить ли счётчик вообще: пока выбор не сделан, скрипт не
 * подключается. Отказ — это отказ, а не «показали и всё равно загрузили».
 *
 * Выбор хранится в localStorage, а не в cookie: cookie ради согласия на
 * cookie — это то самое, что согласие и должно было предотвратить.
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { t } from '@/shared/i18n';

export const COOKIE_CHOICE_KEY = 'analytics-consent';

export type CookieChoice = 'granted' | 'denied';

/**
 * Что человек выбрал. `null` — ещё не выбирал.
 *
 * Доступ к localStorage обёрнут: в приватном окне и при отключённых данных
 * сайта он бросает исключение, а не возвращает null.
 */
export function analyticsChoice(): CookieChoice | null {
    try {
        const raw = localStorage.getItem(COOKIE_CHOICE_KEY);
        return raw === 'granted' || raw === 'denied' ? raw : null;
    } catch {
        return null;
    }
}

export function CookieConsent({ onChoice }: { onChoice?: (choice: CookieChoice) => void }) {
    // Полоса рисуется только после монтирования: на сервере выбора не видно,
    // и отрисованная там полоса мигнула бы у того, кто уже ответил.
    const [choice, setChoice] = useState<CookieChoice | null | 'unknown'>('unknown');

    useEffect(() => {
        setChoice(analyticsChoice());
    }, []);

    const decide = (value: CookieChoice) => {
        try {
            localStorage.setItem(COOKIE_CHOICE_KEY, value);
        } catch {
            // Не сохранилось — спросим в следующий раз. Молча грузить счётчик
            // при этом всё равно нельзя.
        }
        setChoice(value);
        // Счётчик слушает это событие: в своей же вкладке storage не срабатывает.
        window.dispatchEvent(new Event('analytics-consent-changed'));
        onChoice?.(value);
    };

    if (choice !== null) {
        return null;
    }

    return (
        <div
            role="dialog"
            aria-label={t('cookies.title')}
            data-testid="cookie-consent"
            className="fixed inset-x-0 bottom-0 z-[60] border-t border-gray-200 bg-white p-4 shadow-lg sm:p-5"
        >
            <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-gray-700">
                    {t('cookies.body')}{' '}
                    <Link href="/legal/privacy" className="text-blue-600 underline underline-offset-2">
                        {t('cookies.policy')}
                    </Link>
                </p>
                <div className="flex shrink-0 gap-2">
                    <button
                        type="button"
                        onClick={() => decide('denied')}
                        className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                        {t('cookies.decline')}
                    </button>
                    <button
                        type="button"
                        onClick={() => decide('granted')}
                        className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
                    >
                        {t('cookies.accept')}
                    </button>
                </div>
            </div>
        </div>
    );
}
