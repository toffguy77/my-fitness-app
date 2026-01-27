import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Договор публичной оферты | BURCEV',
    description: 'Договор публичной оферты на оказание услуг платформы BURCEV',
};

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm p-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-8">
                    Договор публичной оферты
                </h1>

                <div className="prose prose-gray max-w-none">
                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            1. Общие положения
                        </h2>
                        <p className="text-gray-700 mb-4">
                            Настоящий документ является официальным предложением (публичной офертой)
                            ООО "BURCEV" (далее — "Исполнитель") для физических лиц (далее — "Пользователь")
                            заключить договор на оказание услуг по предоставлению доступа к платформе
                            отслеживания питания и фитнеса BURCEV (далее — "Платформа").
                        </p>
                        <p className="text-gray-700 mb-4">
                            Акцептом настоящей оферты является регистрация на Платформе и создание
                            учетной записи Пользователя.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            2. Предмет договора
                        </h2>
                        <p className="text-gray-700 mb-4">
                            2.1. Исполнитель обязуется предоставить Пользователю доступ к функционалу
                            Платформы для ведения дневника питания, отслеживания калорий и макронутриентов,
                            а также взаимодействия с тренерами и нутрициологами.
                        </p>
                        <p className="text-gray-700 mb-4">
                            2.2. Пользователь обязуется использовать Платформу в соответствии с условиями
                            настоящего договора и применимым законодательством.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            3. Права и обязанности сторон
                        </h2>
                        <p className="text-gray-700 mb-4">
                            3.1. Исполнитель обязуется:
                        </p>
                        <ul className="list-disc pl-6 mb-4 text-gray-700">
                            <li>Обеспечивать работоспособность Платформы 24/7</li>
                            <li>Обеспечивать защиту персональных данных Пользователя</li>
                            <li>Предоставлять техническую поддержку</li>
                            <li>Уведомлять о существенных изменениях в работе Платформы</li>
                        </ul>
                        <p className="text-gray-700 mb-4">
                            3.2. Пользователь обязуется:
                        </p>
                        <ul className="list-disc pl-6 mb-4 text-gray-700">
                            <li>Предоставлять достоверную информацию при регистрации</li>
                            <li>Не передавать доступ к своей учетной записи третьим лицам</li>
                            <li>Не использовать Платформу в противоправных целях</li>
                            <li>Своевременно оплачивать услуги (для премиум-подписки)</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            4. Стоимость услуг и порядок расчетов
                        </h2>
                        <p className="text-gray-700 mb-4">
                            4.1. Базовый функционал Платформы предоставляется бесплатно.
                        </p>
                        <p className="text-gray-700 mb-4">
                            4.2. Расширенный функционал (премиум-подписка) предоставляется на платной
                            основе согласно тарифам, размещенным на Платформе.
                        </p>
                        <p className="text-gray-700 mb-4">
                            4.3. Оплата производится через платежные системы, интегрированные с Платформой.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            5. Ответственность сторон
                        </h2>
                        <p className="text-gray-700 mb-4">
                            5.1. Исполнитель не несет ответственности за:
                        </p>
                        <ul className="list-disc pl-6 mb-4 text-gray-700">
                            <li>Результаты использования Платформы Пользователем</li>
                            <li>Временные технические сбои и перерывы в работе</li>
                            <li>Действия третьих лиц, получивших доступ к учетной записи Пользователя</li>
                        </ul>
                        <p className="text-gray-700 mb-4">
                            5.2. Пользователь несет полную ответственность за сохранность своих учетных данных.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            6. Срок действия и расторжение договора
                        </h2>
                        <p className="text-gray-700 mb-4">
                            6.1. Договор вступает в силу с момента регистрации Пользователя и действует
                            бессрочно.
                        </p>
                        <p className="text-gray-700 mb-4">
                            6.2. Пользователь вправе расторгнуть договор в любое время, удалив свою
                            учетную запись.
                        </p>
                        <p className="text-gray-700 mb-4">
                            6.3. Исполнитель вправе расторгнуть договор в одностороннем порядке при
                            нарушении Пользователем условий настоящего договора.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            7. Заключительные положения
                        </h2>
                        <p className="text-gray-700 mb-4">
                            7.1. Исполнитель оставляет за собой право вносить изменения в настоящий
                            договор, уведомляя об этом Пользователей через Платформу.
                        </p>
                        <p className="text-gray-700 mb-4">
                            7.2. Все споры разрешаются путем переговоров, а при недостижении согласия —
                            в судебном порядке по месту нахождения Исполнителя.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            8. Реквизиты Исполнителя
                        </h2>
                        <p className="text-gray-700 mb-2">
                            <strong>ООО "BURCEV"</strong>
                        </p>
                        <p className="text-gray-700 mb-2">
                            ИНН: 1234567890
                        </p>
                        <p className="text-gray-700 mb-2">
                            ОГРН: 1234567890123
                        </p>
                        <p className="text-gray-700 mb-2">
                            Адрес: Россия, г. Москва
                        </p>
                        <p className="text-gray-700 mb-2">
                            Email: legal@burcev.team
                        </p>
                    </section>

                    <div className="mt-12 pt-8 border-t border-gray-200">
                        <p className="text-sm text-gray-500">
                            Дата последнего обновления: 26 января 2026 г.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
