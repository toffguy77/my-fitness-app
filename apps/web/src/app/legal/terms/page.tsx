import type { Metadata } from 'next';
import { LEGAL_DOCUMENTS_UPDATED, SELLER } from '@/shared/constants/legal';

export const metadata: Metadata = {
    title: 'Договор публичной оферты',
    description: 'Договор публичной оферты на оказание услуг платформы BURCEV',
    alternates: { canonical: 'https://burcev.team/legal/terms' },
};

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-canvas px-screen-x py-10 sm:py-14">
            <article className="mx-auto max-w-content">
                <h1 className="mb-10 type-display text-fg">
                    Договор публичной оферты
                </h1>

                <div className="type-body text-fg">
                    <section className="mb-10">
                        <h2 className="mb-4 type-title-2 text-fg">
                            1. Общие положения
                        </h2>
                        <p className="mb-4 text-fg">
                            Настоящий документ является официальным предложением (публичной офертой)
                            {SELLER.fullName} (далее — "Исполнитель") для физических лиц (далее — "Пользователь")
                            заключить договор на оказание услуг по предоставлению доступа к платформе
                            отслеживания питания и фитнеса BURCEV (далее — "Платформа").
                        </p>
                        <p className="mb-4 text-fg">
                            Акцептом настоящей оферты является регистрация на Платформе и создание
                            учетной записи Пользователя.
                        </p>
                    </section>

                    <section className="mb-10">
                        <h2 className="mb-4 type-title-2 text-fg">
                            2. Предмет договора
                        </h2>
                        <p className="mb-4 text-fg">
                            2.1. Исполнитель обязуется предоставить Пользователю доступ к функционалу
                            Платформы для ведения дневника питания, отслеживания калорий и макронутриентов.
                        </p>
                        <p className="mb-4 text-fg">
                            2.2. Работа с куратором является отдельной платной услугой и включает:
                            переписку с куратором, составление недельного плана калорийности и
                            макронутриентов, письменный разбор недели.
                        </p>
                        <p className="mb-4 text-fg">
                            2.3. Пользователь обязуется использовать Платформу в соответствии с условиями
                            настоящего договора и применимым законодательством.
                        </p>
                    </section>

                    <section className="mb-10">
                        <h2 className="mb-4 type-title-2 text-fg">
                            3. Права и обязанности сторон
                        </h2>
                        <p className="mb-4 text-fg">
                            3.1. Исполнитель обязуется:
                        </p>
                        <ul className="mb-4 list-disc space-y-1.5 pl-6 text-fg marker:text-fg-subtle">
                            <li>Обеспечивать работоспособность Платформы 24/7</li>
                            <li>Обеспечивать защиту персональных данных Пользователя</li>
                            <li>Предоставлять техническую поддержку</li>
                            <li>Уведомлять о существенных изменениях в работе Платформы</li>
                        </ul>
                        <p className="mb-4 text-fg">
                            3.2. Пользователь обязуется:
                        </p>
                        <ul className="mb-4 list-disc space-y-1.5 pl-6 text-fg marker:text-fg-subtle">
                            <li>Предоставлять достоверную информацию при регистрации</li>
                            <li>Не передавать доступ к своей учетной записи третьим лицам</li>
                            <li>Не использовать Платформу в противоправных целях</li>
                            <li>Своевременно оплачивать услугу работы с куратором</li>
                        </ul>
                    </section>

                    <section className="mb-10">
                        <h2 className="mb-4 type-title-2 text-fg">
                            4. Стоимость услуг, порядок расчетов и возврат оплаты
                        </h2>
                        <p className="mb-4 text-fg">
                            4.1. Функционал Платформы предоставляется бесплатно, за исключением услуги
                            работы с куратором.
                        </p>
                        <p className="mb-4 text-fg">
                            4.2. Стоимость услуги работы с куратором указана на{' '}
                            <a href="/pricing" className="font-semibold text-primary underline underline-offset-2">
                                странице тарифов
                            </a>{' '}
                            Платформы.
                        </p>
                        <p className="mb-4 text-fg">
                            4.3. Стоимость, действовавшая на момент оплаты, сохраняется до окончания
                            оплаченного периода. Изменение тарифа применяется начиная со следующего
                            периода.
                        </p>
                        <p className="mb-4 text-fg">
                            4.4. Оплаченный период оканчивается в 23:59 последнего дня периода по
                            московскому времени (UTC+3).
                        </p>
                        <p className="mb-4 text-fg">
                            4.5. Пользователь вправе отказаться от услуги работы с куратором в течение
                            7 (семи) календарных дней с момента оплаты и получить возврат оплаты в полном
                            размере. Возврат в этот срок не обусловлен тем, пользовался ли Пользователь
                            услугой.
                        </p>
                        <p className="mb-4 text-fg">
                            4.6. Пользователь вправе отказаться от услуги в любой момент после
                            истечения срока, указанного в пункте 4.5, и получить возврат оплаты
                            пропорционально количеству неиспользованных дней оплаченного периода.
                        </p>
                    </section>

                    <section className="mb-10">
                        <h2 className="mb-4 type-title-2 text-fg">
                            5. Ответственность сторон
                        </h2>
                        <p className="mb-4 text-fg">
                            5.1. Исполнитель не несет ответственности за:
                        </p>
                        <ul className="mb-4 list-disc space-y-1.5 pl-6 text-fg marker:text-fg-subtle">
                            <li>Результаты использования Платформы Пользователем</li>
                            <li>Временные технические сбои и перерывы в работе</li>
                            <li>Действия третьих лиц, получивших доступ к учетной записи Пользователя</li>
                        </ul>
                        <p className="mb-4 text-fg">
                            5.2. Пользователь несет полную ответственность за сохранность своих учетных данных.
                        </p>
                    </section>

                    <section className="mb-10">
                        <h2 className="mb-4 type-title-2 text-fg">
                            6. Срок действия и расторжение договора
                        </h2>
                        <p className="mb-4 text-fg">
                            6.1. Договор вступает в силу с момента регистрации Пользователя и действует
                            бессрочно.
                        </p>
                        <p className="mb-4 text-fg">
                            6.2. Пользователь вправе расторгнуть договор в любое время, удалив свою
                            учетную запись.
                        </p>
                        <p className="mb-4 text-fg">
                            6.3. Исполнитель вправе расторгнуть договор в одностороннем порядке при
                            нарушении Пользователем условий настоящего договора.
                        </p>
                    </section>

                    <section className="mb-10">
                        <h2 className="mb-4 type-title-2 text-fg">
                            7. Заключительные положения
                        </h2>
                        <p className="mb-4 text-fg">
                            7.1. Исполнитель оставляет за собой право вносить изменения в настоящий
                            договор, уведомляя об этом Пользователей через Платформу.
                        </p>
                        <p className="mb-4 text-fg">
                            7.2. Все споры разрешаются путем переговоров, а при недостижении согласия —
                            в судебном порядке по месту нахождения Исполнителя.
                        </p>
                    </section>

                    <section className="mb-10">
                        <h2 className="mb-4 type-title-2 text-fg">
                            8. Реквизиты Исполнителя
                        </h2>
                        <p className="mb-2 text-fg">
                            <strong>{SELLER.fullName}</strong>
                        </p>
                        <p className="mb-2 text-fg">
                            ИНН: {SELLER.inn}
                        </p>
                        <p className="mb-2 text-fg">
                            ОГРНИП: {SELLER.ogrnip}
                        </p>
                        <p className="mb-2 text-fg">
                            Адрес: {SELLER.address}
                        </p>
                        <p className="mb-2 text-fg">
                            Email: {SELLER.email}
                        </p>
                    </section>

                    <div className="mt-12 border-t border-line pt-8">
                        <p className="text-sm text-fg-muted">
                            Дата последнего обновления: {LEGAL_DOCUMENTS_UPDATED}
                        </p>
                    </div>
                </div>
            </article>
        </div>
    );
}
