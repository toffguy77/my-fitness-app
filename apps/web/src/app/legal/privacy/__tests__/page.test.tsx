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

        expect(screen.getByText(/yandex\.cloud/i)).toBeInTheDocument();
    });

    it('displays last update date', () => {
        render(<PrivacyPage />);

        expect(screen.getByText(/дата последнего обновления: 26 января 2026 г\./i)).toBeInTheDocument();
    });

    it('has correct metadata', () => {
        expect(metadata.title).toBe('Политика конфиденциальности | BURCEV');
        expect(metadata.description).toBe('Политика конфиденциальности и обработки персональных данных платформы BURCEV');
    });

    it('renders with proper styling classes', () => {
        const { container } = render(<PrivacyPage />);

        expect(container.querySelector('.min-h-screen')).toBeInTheDocument();
        expect(container.querySelector('.bg-white')).toBeInTheDocument();
        expect(container.querySelector('.rounded-lg')).toBeInTheDocument();
    });

    it('mentions user rights', () => {
        render(<PrivacyPage />);

        expect(screen.getByText(/получать информацию об обработке ваших персональных данных/i)).toBeInTheDocument();
        expect(screen.getByText(/требовать уточнения, блокирования или удаления данных/i)).toBeInTheDocument();
        expect(screen.getByText(/отозвать согласие на обработку данных/i)).toBeInTheDocument();
    });
});
