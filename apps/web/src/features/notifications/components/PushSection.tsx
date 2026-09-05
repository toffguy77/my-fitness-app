'use client'

/**
 * Turning push on, for this browser.
 *
 * The browser's permission prompt is never fired on load. A prompt shown before
 * somebody knows what the product does is the fastest route to a permanent
 * "no": the browser remembers a refusal and there is no second chance to ask.
 * So the explanation comes first, and the prompt follows a click.
 */

import { usePushSubscription } from '../hooks/usePushSubscription'

export function PushSection() {
    const { state, busy, enable, disable } = usePushSubscription()

    if (state === 'unknown') return null

    return (
        <div className="rounded-2xl bg-white p-4 shadow-sm" data-testid="push-section">
            <p className="mb-1 text-sm font-medium text-gray-500">Push на это устройство</p>

            {state === 'unsupported' && (
                <p className="py-2 text-sm text-gray-500">
                    Этот браузер не умеет присылать push. Уведомления остаются в приложении, а о
                    важном придёт письмо.
                </p>
            )}

            {state === 'needs-install' && (
                <p className="py-2 text-sm text-gray-500">
                    На iPhone и iPad push приходит только тем, кто добавил приложение на домашний
                    экран: «Поделиться» → «На экран „Домой“». После этого вернитесь сюда и включите
                    push.
                </p>
            )}

            {state === 'denied' && (
                <p className="py-2 text-sm text-gray-500">
                    Вы запретили уведомления в этом браузере, и повторно спросить он не даст —
                    разрешение возвращается в его настройках сайта. Письма это не затрагивает.
                </p>
            )}

            {state === 'available' && (
                <div className="py-2">
                    <p className="text-sm text-gray-500">
                        Push приходит сразу — ответ куратора или просроченная задача не будут ждать,
                        пока вы откроете приложение. Браузер спросит разрешение, когда вы нажмёте
                        кнопку.
                    </p>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void enable()}
                        className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                        {busy ? 'Включаем...' : 'Включить push'}
                    </button>
                </div>
            )}

            {state === 'subscribed' && (
                <div className="flex items-center justify-between py-2">
                    <p className="pr-4 text-sm text-gray-500">
                        Push включён на этом устройстве. На других устройствах его нужно включить
                        отдельно.
                    </p>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void disable()}
                        className="shrink-0 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
                    >
                        {busy ? 'Выключаем...' : 'Выключить'}
                    </button>
                </div>
            )}
        </div>
    )
}

PushSection.displayName = 'PushSection'
