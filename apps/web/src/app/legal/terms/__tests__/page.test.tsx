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
        expect(screen.getByRole('heading', { name: /4\. стоимость услуг, порядок расчетов и возврат оплаты/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /5\. ответственность сторон/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /6\. срок действия и расторжение договора/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /7\. заключительные положения/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /8\. реквизиты исполнителя/i })).toBeInTheDocument();
    });

    // Исполнитель — реальное лицо. С заглушкой «ООО BURCEV, ИНН 1234567890»
    // стороны договора не существовало, и платёжный сервис отказал бы в
    // подключении.
    it('names the contractor with real requisites', () => {
        const { container } = render(<TermsPage />);
        const text = container.textContent ?? '';

        expect(text).toContain('Индивидуальный предприниматель Бурцев Сергей Викторович');
        expect(text).toContain('572006540445');
        expect(text).toContain('324774600419913');
        expect(text).toContain('108826');
        expect(text).toContain('ул. Александры Монаховой, д. 90, корп. 1, кв. 145');
        expect(screen.getByText(/legal@burcev\.team/i)).toBeInTheDocument();
    });

    it('carries no placeholder requisites', () => {
        const { container } = render(<TermsPage />);
        const text = container.textContent ?? '';

        expect(text).not.toContain('1234567890');
        expect(text).not.toMatch(/ООО/);
    });

    // Банковские реквизиты идут в счета, а не на страницу.
    it('does not publish the bank account', () => {
        const { container } = render(<TermsPage />);
        const text = container.textContent ?? '';

        expect(text).not.toContain('40802810700006363895');
        expect(text).not.toMatch(/БИК/);
    });

    it('displays last update date', () => {
        render(<TermsPage />);

        expect(screen.getByText(/дата последнего обновления: 6 октября 2026 г\./i)).toBeInTheDocument();
    });

    it('называет состав платной услуги', () => {
        render(<TermsPage />);

        expect(screen.getByText(/работа с куратором является отдельной платной услугой/i)).toBeInTheDocument();
        expect(screen.getByText(/недельного плана калорийности/i)).toBeInTheDocument();
        expect(screen.getByText(/письменный разбор недели/i)).toBeInTheDocument();
    });

    it('называет бесплатной всё, кроме работы с куратором', () => {
        render(<TermsPage />);

        expect(screen.getByText(/предоставляется бесплатно, за исключением услуги/i)).toBeInTheDocument();
    });

    // Обещанный вслепую срок придётся либо нарушать, либо выполнять в убыток, а
    // нарушение становится основанием для возврата. Пропускная способность
    // куратора не измерена.
    it('не обещает срок ответа куратора', () => {
        const { container } = render(<TermsPage />);

        expect(container.textContent).not.toMatch(/в течение \d+\s*(час|ч\.)/i);
        expect(container.textContent).not.toMatch(/ответ.{0,40}\d+\s*час/i);
    });

    // Цена, повторённая в двух местах, расходится, и какое из двух
    // обязательство — неизвестно.
    it('не приводит цену числом и ссылается на страницу тарифов', () => {
        const { container } = render(<TermsPage />);

        expect(container.textContent).not.toMatch(/\d[\d\s]*₽/);
        expect(container.textContent).not.toMatch(/\d[\d\s]*руб/i);
        expect(screen.getByRole('link', { name: /странице тарифов/i })).toHaveAttribute('href', '/pricing');
    });

    it('даёт безусловный возврат в первые семь дней', () => {
        render(<TermsPage />);

        expect(screen.getByText(/в течение\s+7 \(семи\) календарных дней/i)).toBeInTheDocument();
        expect(screen.getByText(/не обусловлен тем, пользовался ли Пользователь/i)).toBeInTheDocument();
    });

    // При предоплате за несколько месяцев ограничение семью днями создаёт спор,
    // в котором обязательство всё равно возникает.
    it('даёт возврат за неиспользованный период в любой момент', () => {
        render(<TermsPage />);

        expect(screen.getByText(/пропорционально количеству неиспользованных дней/i)).toBeInTheDocument();
    });

    it('фиксирует цену на оплаченный период', () => {
        render(<TermsPage />);

        expect(screen.getByText(/сохраняется до окончания\s+оплаченного периода/i)).toBeInTheDocument();
    });

    // Не объявленный пояс делает момент прекращения доступа неизвестным тому,
    // кто заплатил.
    it('называет часовой пояс окончания оплаченного периода', () => {
        render(<TermsPage />);

        expect(screen.getByText(/по\s+московскому времени \(UTC\+3\)/i)).toBeInTheDocument();
    });

    it('has correct metadata', () => {
        expect(metadata.title).toBe('Договор публичной оферты | BURCEV');
        expect(metadata.description).toBe('Договор публичной оферты на оказание услуг платформы BURCEV');
    });

    it('renders as a readable article with a single page heading', () => {
        const { container } = render(<TermsPage />);

        expect(container.querySelector('.min-h-screen')).toBeInTheDocument();
        expect(container.querySelector('article')).toBeInTheDocument();
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0);
    });
});
