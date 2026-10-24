import { render, screen } from '@testing-library/react';
import PrivacyPage, { metadata } from '../page';

describe('PrivacyPage', () => {
    it('renders the page title', () => {
        render(<PrivacyPage />);
        expect(screen.getByRole('heading', { level: 1, name: /политика конфиденциальности/i })).toBeInTheDocument();
    });

    it('renders all main sections', () => {
        render(<PrivacyPage />);

        expect(screen.getByRole('heading', { name: /1\. общие положения/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /2\. какие данные мы собираем/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /3\. цели обработки данных/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /4\. правовые основания обработки данных/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /5\. как мы защищаем ваши данные/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /6\. передача данных третьим лицам/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /7\. хранение данных/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /8\. ваши права/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /9\. cookies и аналитика/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /10\. изменения в политике/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /11\. контактная информация/i })).toBeInTheDocument();
    });

    it('displays data collection information', () => {
        render(<PrivacyPage />);

        expect(screen.getByText(/email адрес/i)).toBeInTheDocument();
        expect(screen.getByText(/пароль \(в зашифрованном виде\)/i)).toBeInTheDocument();
    });

    it('displays security measures', () => {
        render(<PrivacyPage />);

        expect(screen.getByText(/шифрование данных при передаче \(HTTPS\/TLS\)/i)).toBeInTheDocument();
        expect(screen.getByText(/хеширование паролей \(bcrypt\)/i)).toBeInTheDocument();
    });

    it('displays contact information', () => {
        render(<PrivacyPage />);

        expect(screen.getAllByText(/privacy@burcev\.team/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/support@burcev\.team/i)).toBeInTheDocument();
    });

    it('mentions Yandex.Cloud hosting', () => {
        render(<PrivacyPage />);

        // Раздел 7.1 и раздел о данных Здоровья.
        expect(screen.getAllByText(/yandex\.cloud/i).length).toBeGreaterThan(0);
    });

    it('displays last update date', () => {
        render(<PrivacyPage />);

        expect(screen.getByText(/дата последнего обновления: 6 октября 2026 г\./i)).toBeInTheDocument();
    });

    // Cookie first_touch хранит 30 дней, откуда человек впервые пришёл.
    // Цель обработки должна быть названа в политике, а не только в коде.
    it('names keeping where a visitor first came from among the uses of cookies', () => {
        const { container } = render(<PrivacyPage />);
        const text = container.textContent ?? '';

        expect(text).toMatch(/откуда вы впервые пришли/i);
        expect(text).toMatch(/30 дней/);
    });

    // 152-ФЗ: субъект должен знать, кто обрабатывает его данные. Названное
    // раньше ООО не существовало.
    it('names the real operator of personal data', () => {
        render(<PrivacyPage />);

        const operator = screen.getByTestId('privacy-operator');
        expect(operator).toHaveTextContent('Бурцев Сергей Викторович');
        expect(operator).toHaveTextContent('572006540445');
        expect(operator).toHaveTextContent('324774600419913');
        expect(operator).toHaveTextContent('108826');
        expect(operator.textContent).not.toMatch(/ООО/);

        const intro = screen.getByTestId('privacy-intro');
        expect(intro).toHaveTextContent('Бурцев Сергей Викторович');
        expect(intro.textContent).not.toMatch(/ООО/);
    });

    // App Review 5.1.2 и 5.1.3: политика должна прямо сказать, что читается
    // и пишется в HealthKit, зачем, что не для рекламы и не третьим лицам, не
    // в iCloud, как отключить и что происходит при удалении аккаунта. Без
    // такого раздела приложение с HealthKit отклоняют.
    describe('Apple Health section', () => {
        const section = () => {
            render(<PrivacyPage />);
            return screen.getByTestId('privacy-apple-health');
        };

        it('is a numbered section with an anchor the user guide links to', () => {
            render(<PrivacyPage />);
            const heading = screen.getByRole('heading', { level: 2, name: /2-а\. данные apple здоровье \(healthkit\)/i });
            expect(heading.closest('section')).toHaveAttribute('id', 'apple-health');
        });

        it('names what is read from and written to Health, and that weight is never written', () => {
            const text = section().textContent ?? '';
            expect(text).toMatch(/шаги/);
            expect(text).toMatch(/вес тела/);
            expect(text).toMatch(/тренировки/);
            expect(text).toMatch(/калории, белки, жиры и\s+углеводы/);
            expect(text).toMatch(/выпитую\s+воду/);
            expect(text).toMatch(/Вес тела приложение в «Здоровье» не записывает/);
        });

        it('limits the purpose to the diary and the curator', () => {
            const text = section().textContent ?? '';
            expect(text).toMatch(/только для работы\s+сервиса/);
            expect(text).toMatch(/куратор/);
        });

        it('rules out advertising, marketing, data mining, sale and third parties', () => {
            const text = section().textContent ?? '';
            expect(text).toMatch(/не используем для рекламы, маркетинга/);
            expect(text).toMatch(/data mining/);
            expect(text).toMatch(/не продаём и не передаём третьим лицам/);
        });

        it('says Health data is not kept in iCloud and where it is kept instead', () => {
            const text = section().textContent ?? '';
            expect(text).toMatch(/не храним в iCloud/);
            expect(text).toMatch(/Российской Федерации/);
        });

        it('explains how to disconnect in the app and revoke in iOS Settings', () => {
            const text = section().textContent ?? '';
            expect(text).toMatch(/«Профиль → Здоровье»/);
            expect(text).toMatch(/«Настройки → Здоровье → Доступ к\s+данным и устройства → Взвешено»/);
        });

        it('ties retention to the account and deletion to account erasure', () => {
            const text = section().textContent ?? '';
            expect(text).toMatch(/пока существует ваша учётная запись/);
            expect(text).toMatch(/При удалении учётной записи \(раздел 7-а\)/);
        });
    });

    describe('iPhone app section', () => {
        it('is a numbered section', () => {
            render(<PrivacyPage />);
            expect(screen.getByRole('heading', { level: 2, name: /9-а\. приложение для iphone/i })).toBeInTheDocument();
        });

        // Sentry принимает отчёты в ЕС (ingest.de.sentry.io), а п. 7.1 говорит
        // о серверах в РФ: исключение должно быть названо, иначе политика
        // неправдива.
        it('names Sentry, what a crash report holds, and that it is processed outside Russia', () => {
            const { container } = render(<PrivacyPage />);
            const text = screen.getByTestId('privacy-ios-app').textContent ?? '';
            expect(text).toMatch(/Sentry/);
            expect(text).toMatch(/Данных «Здоровья»/);
            expect(text).toMatch(/за\s+пределами Российской Федерации/);
            expect(container.textContent).toMatch(/Единственное исключение — отчёты о\s+сбоях/);
        });

        it('names the push token and the device model, and rules out tracking', () => {
            render(<PrivacyPage />);
            const text = screen.getByTestId('privacy-ios-app').textContent ?? '';
            expect(text).toMatch(/Токен push-уведомлений/);
            expect(text).toMatch(/Название модели устройства/);
            expect(text).toMatch(/не запрашиваем\s+разрешение на отслеживание/);
        });
    });

    it('has correct metadata', () => {
        // «| BURCEV» дописывает шаблон корневого layout.
        expect(metadata.title).toBe('Политика конфиденциальности');
        expect(metadata.description).toBe('Политика конфиденциальности и обработки персональных данных платформы BURCEV');
    });

    it('renders as a readable article with a single page heading', () => {
        const { container } = render(<PrivacyPage />);

        expect(container.querySelector('.min-h-screen')).toBeInTheDocument();
        expect(container.querySelector('article')).toBeInTheDocument();
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0);
    });

    it('mentions user rights', () => {
        render(<PrivacyPage />);

        expect(screen.getByText(/получать информацию об обработке ваших персональных данных/i)).toBeInTheDocument();
        expect(screen.getByText(/требовать уточнения, блокирования или удаления данных/i)).toBeInTheDocument();
        expect(screen.getByText(/отозвать согласие на обработку данных/i)).toBeInTheDocument();
    });
});
