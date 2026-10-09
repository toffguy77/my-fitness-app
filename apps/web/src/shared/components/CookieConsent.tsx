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

import { useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Cookie } from 'lucide-react';
import { t } from '@/shared/i18n';
import { Button } from '@/shared/components/ui/Button';

export const COOKIE_CHOICE_KEY = 'analytics-consent';

/** Событие, которым полоса сообщает о выборе в своей же вкладке. */
export const CONSENT_EVENT = 'analytics-consent-changed';

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

/** Подписка на изменение выбора: своё событие плюс другая вкладка. */
export function subscribeToAnalyticsChoice(onChange: () => void): () => void {
    window.addEventListener(CONSENT_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
        window.removeEventListener(CONSENT_EVENT, onChange);
        window.removeEventListener('storage', onChange);
    };
}

/**
 * Где полоса уместна.
 *
 * Только на публичных страницах: посадочная, вход, юридические тексты,
 * гостевой мастер. Внутри кабинета её быть не должно — там снизу закреплена
 * навигация, а страницы свёрстаны с отступом ровно под неё. Полоса отнимала
 * у них ещё сотню пикселей, которых никто не закладывал, и кнопки внизу
 * страниц становились недостижимы: набор E2E показал это дважды подряд,
 * сперва перекрытой навигацией, потом перекрытыми кнопками настроек.
 *
 * Спросить один раз при первом заходе достаточно: ответ хранится и действует
 * везде. Кто попал сразу в кабинет по прямой ссылке и полосы не видел,
 * остаётся без счётчика — это безопасная сторона умолчания.
 */
const PUBLIC_PREFIXES = ['/auth', '/legal', '/onboarding', '/reset-password', '/forgot-password'];

export function isPublicPath(pathname: string): boolean {
    return pathname === '/' || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function CookieConsent({ onChoice }: { onChoice?: (choice: CookieChoice) => void }) {
    const pathname = usePathname();
    // useSyncExternalStore, а не чтение в эффекте: выбор живёт вне React, а
    // запись его в состояние из useEffect — лишний проход отрисовки, на
    // который правило react-hooks и ругается. На сервере выбора не видно
    // вовсе, поэтому серверный снимок — null, и полоса там не рисуется.
    const choice = useSyncExternalStore(
        subscribeToAnalyticsChoice,
        analyticsChoice,
        () => 'unknown' as const,
    );

    const decide = (value: CookieChoice) => {
        try {
            localStorage.setItem(COOKIE_CHOICE_KEY, value);
        } catch {
            // Не сохранилось — спросим в следующий раз. Молча грузить счётчик
            // при этом всё равно нельзя.
        }
        // Своё событие: в своей вкладке storage не срабатывает. Оно же
        // перерисовывает и полосу, и счётчик — оба читают один источник.
        window.dispatchEvent(new Event(CONSENT_EVENT));
        onChoice?.(value);
    };

    if (choice !== null || !isPublicPath(pathname ?? '/')) {
        return null;
    }

    return (
        <div
            role="dialog"
            aria-label={t('cookies.title')}
            data-testid="cookie-consent"
            // bottom-16, а не bottom-0: нижняя навигация приложения занимает
            // ровно эти 64 пикселя, и полоса поверх неё перекрывала переходы
            // между разделами — нажать «Дневник» или «Чаты» было нельзя,
            // пока не ответишь про cookie. Поймал набор E2E: разом упали все
            // проверки навигации клиента, куратора и администратора.
            //
            // Полоса в потоке страницы, а не поверх неё.
            //
            // Плавающее размещение перепробовано трижды и трижды перекрыло
            // живые элементы: сперва нижнюю навигацию целиком, потом кнопки
            // внизу страниц настроек, потом кнопку продолжения мастера и
            // виджет поддержки на посадочной. Любое «поверх» отнимает место,
            // которого страница не закладывала, — и находится страница, где
            // это место занято.
            //
            // В потоке она сдвигает содержимое вниз, ничего не перекрывает и
            // видна сразу при открытии. Пропадает при прокрутке — и это
            // приемлемо: ответ нужен один раз и запоминается.
            //
            // Поэтому и тени нет: она у того, что лежит над экраном, а полоса
            // лежит в нём — карточкой с линией, как любая поверхность страницы.
            className="px-screen-x pt-3"
        >
            <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-start gap-3 text-sm text-fg">
                    <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-fg-muted" strokeWidth={1.8} aria-hidden="true" />
                    <span>
                        {t('cookies.body')}{' '}
                        <Link href="/legal/privacy" className="font-semibold text-primary underline underline-offset-2">
                            {t('cookies.policy')}
                        </Link>
                    </span>
                </p>
                {/* Отказ и согласие — одного веса: выбор не подталкивается
                    цветом, и терракота остаётся главному действию страницы. */}
                <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                    <Button type="button" variant="secondary" onClick={() => decide('denied')}>
                        {t('cookies.decline')}
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => decide('granted')}>
                        {t('cookies.accept')}
                    </Button>
                </div>
            </div>
        </div>
    );
}
