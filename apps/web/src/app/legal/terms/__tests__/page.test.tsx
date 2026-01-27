import { render, screen } from '@testing-library/react';
import TermsPage, { metadata } from '../page';

describe('TermsPage', () => {
    it('renders the page title', () => {
        render(<TermsPage />);
        expect(screen.getByRole('heading', { level: 1, name: /договор публичной оферты/i })).toBeInTheDocument();
    });

    it('renders all main sections', () => {
        render(<TermsPage />);

        expect(screen.getByRole('heading', { name: /1\. общие положения/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /2\. предмет договора/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /3\. права и обязанности сторон/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /4\. стоимость услуг и порядок расчетов/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /5\. ответственность сторон/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /6\. срок действия и расторжение договора/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /7\. заключительные положения/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /8\. реквизиты исполнителя/i })).toBeInTheDocument();
    });

    it('displays company information', () => {
        render(<TermsPage />);

        expect(screen.getAllByText(/ООО "BURCEV"/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/legal@burcev\.team/i)).toBeInTheDocument();
    });

    it('displays last update date', () => {
        render(<TermsPage />);

        expect(screen.getByText(/дата последнего обновления: 26 января 2026 г\./i)).toBeInTheDocument();
    });

    it('mentions free and premium tiers', () => {
        render(<TermsPage />);

        expect(screen.getByText(/базовый функционал платформы предоставляется бесплатно/i)).toBeInTheDocument();
        expect(screen.getByText(/расширенный функционал \(премиум-подписка\)/i)).toBeInTheDocument();
    });

    it('has correct metadata', () => {
        expect(metadata.title).toBe('Договор публичной оферты | BURCEV');
        expect(metadata.description).toBe('Договор публичной оферты на оказание услуг платформы BURCEV');
    });

    it('renders with proper styling classes', () => {
        const { container } = render(<TermsPage />);

        expect(container.querySelector('.min-h-screen')).toBeInTheDocument();
        expect(container.querySelector('.bg-white')).toBeInTheDocument();
        expect(container.querySelector('.rounded-lg')).toBeInTheDocument();
    });
});
