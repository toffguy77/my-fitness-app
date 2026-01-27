import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Политика конфиденциальности | BURCEV',
    description: 'Политика конфиденциальности и обработки персональных данных платформы BURCEV',
};

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm p-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-8">
                    Политика конфиденциальности
                </h1>

                <div className="prose prose-gray max-w-none">
                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            1. Общие положения
                        </h2>
                        <p className="text-gray-700 mb-4">
                            Настоящая Политика конфиденциальности определяет порядок обработки и защиты
                            персональных данных пользователей платформы BURCEV (далее — "Платформа"),
                            принадлежащей ООО "BURCEV" (далее — "Оператор").
                        </p>
                        <p className="text-gray-700 mb-4">
                            Используя Платформу, вы соглашаетесь с условиями настоящей Политики
                            конфиденциальности.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            2. Какие данные мы собираем
                        </h2>
                        <p className="text-gray-700 mb-4">
                            2.1. При регистрации на Платформе мы собираем следующие данные:
                        </p>
                        <ul className="list-disc pl-6 mb-4 text-gray-700">
                            <li>Email адрес</li>
                            <li>Пароль (в зашифрованном виде)</li>
                            <li>Имя и фамилия (опционально)</li>
                        </ul>
                        <p className="text-gray-700 mb-4">
                            2.2. При использовании Платформы мы собираем:
                        </p>
                        <ul className="list-disc pl-6 mb-4 text-gray-700">
                            <li>Данные о питании (калории, макронутриенты, продукты)</li>
                            <li>Данные о весе и физических параметрах</li>
                            <li>Данные о взаимодействии с тренерами</li>
                            <li>Технические данные (IP-адрес, тип устройства, браузер)</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            3. Цели обработки данных
                        </h2>
                        <p className="text-gray-700 mb-4">
                            Мы обрабатываем ваши персональные данные для следующих целей:
                        </p>
                        <ul className="list-disc pl-6 mb-4 text-gray-700">
                            <li>Предоставление доступа к функционалу Платформы</li>
                            <li>Идентификация пользователя</li>
                            <li>Обеспечение взаимодействия с тренерами и нутрициологами</li>
                            <li>Улучшение качества услуг</li>
                            <li>Техническая поддержка</li>
                            <li>Отправка уведомлений и информационных сообщений</li>
                            <li>Маркетинговые коммуникации (при наличии согласия)</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            4. Правовые основания обработки данных
                        </h2>
                        <p className="text-gray-700 mb-4">
                            Обработка персональных данных осуществляется на основании:
                        </p>
                        <ul className="list-disc pl-6 mb-4 text-gray-700">
                            <li>Вашего согласия на обработку персональных данных</li>
                            <li>Договора на оказание услуг (публичной оферты)</li>
                            <li>Федерального закона № 152-ФЗ "О персональных данных"</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            5. Как мы защищаем ваши данные
                        </h2>
                        <p className="text-gray-700 mb-4">
                            Мы применяем следующие меры защиты персональных данных:
                        </p>
                        <ul className="list-disc pl-6 mb-4 text-gray-700">
                            <li>Шифрование данных при передаче (HTTPS/TLS)</li>
                            <li>Хеширование паролей (bcrypt)</li>
                            <li>Ограничение доступа к данным на уровне базы данных (RLS)</li>
                            <li>Регулярное резервное копирование</li>
                            <li>Мониторинг безопасности и аудит доступа</li>
                            <li>Обучение персонала правилам обработки данных</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            6. Передача данных третьим лицам
                        </h2>
                        <p className="text-gray-700 mb-4">
                            6.1. Мы не передаем ваши персональные данные третьим лицам, за исключением
                            следующих случаев:
                        </p>
                        <ul className="list-disc pl-6 mb-4 text-gray-700">
                            <li>С вашего явного согласия</li>
                            <li>Тренерам и нутрициологам (в рамках предоставления услуг)</li>
                            <li>По требованию уполномоченных государственных органов</li>
                            <li>Поставщикам технических услуг (хостинг, аналитика) с соблюдением конфиденциальности</li>
                        </ul>
                        <p className="text-gray-700 mb-4">
                            6.2. Все третьи лица обязаны соблюдать конфиденциальность ваших данных.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            7. Хранение данных
                        </h2>
                        <p className="text-gray-700 mb-4">
                            7.1. Персональные данные хранятся на серверах, расположенных на территории
                            Российской Федерации (Yandex.Cloud).
                        </p>
                        <p className="text-gray-700 mb-4">
                            7.2. Срок хранения данных:
                        </p>
                        <ul className="list-disc pl-6 mb-4 text-gray-700">
                            <li>Учетные данные — до удаления учетной записи</li>
                            <li>Данные о питании — до удаления учетной записи</li>
                            <li>Технические логи — 90 дней</li>
                            <li>Резервные копии — 30 дней</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            8. Ваши права
                        </h2>
                        <p className="text-gray-700 mb-4">
                            В соответствии с законодательством РФ вы имеете право:
                        </p>
                        <ul className="list-disc pl-6 mb-4 text-gray-700">
                            <li>Получать информацию об обработке ваших персональных данных</li>
                            <li>Требовать уточнения, блокирования или удаления данных</li>
                            <li>Отозвать согласие на обработку данных</li>
                            <li>Получить копию ваших данных</li>
                            <li>Обжаловать действия Оператора в Роскомнадзоре или суде</li>
                        </ul>
                        <p className="text-gray-700 mb-4">
                            Для реализации своих прав обращайтесь по адресу: privacy@burcev.team
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            9. Cookies и аналитика
                        </h2>
                        <p className="text-gray-700 mb-4">
                            9.1. Мы используем cookies для:
                        </p>
                        <ul className="list-disc pl-6 mb-4 text-gray-700">
                            <li>Аутентификации пользователей</li>
                            <li>Сохранения настроек</li>
                            <li>Анализа использования Платформы</li>
                        </ul>
                        <p className="text-gray-700 mb-4">
                            9.2. Вы можете отключить cookies в настройках браузера, но это может
                            ограничить функционал Платформы.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            10. Изменения в Политике
                        </h2>
                        <p className="text-gray-700 mb-4">
                            Мы оставляем за собой право вносить изменения в настоящую Политику
                            конфиденциальности. О существенных изменениях мы уведомим вас по email
                            или через уведомления на Платформе.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            11. Контактная информация
                        </h2>
                        <p className="text-gray-700 mb-2">
                            <strong>Оператор персональных данных:</strong> ООО "BURCEV"
                        </p>
                        <p className="text-gray-700 mb-2">
                            <strong>Адрес:</strong> Россия, г. Москва
                        </p>
                        <p className="text-gray-700 mb-2">
                            <strong>Email:</strong> privacy@burcev.team
                        </p>
                        <p className="text-gray-700 mb-2">
                            <strong>Поддержка:</strong> support@burcev.team
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
