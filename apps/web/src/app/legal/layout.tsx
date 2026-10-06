import Link from 'next/link';
import { Logo } from '@/shared/components/ui';

export default function LegalLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-canvas">
            {/* Header with navigation */}
            <header className="bg-surface border-b border-line">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <Link href="/" className="flex items-center">
                            <Logo width={120} height={36} className="text-fg" />
                        </Link>
                        <nav className="flex space-x-6">
                            <Link
                                href="/legal/terms"
                                className="text-sm text-fg-muted hover:text-fg transition-colors"
                            >
                                Договор оферты
                            </Link>
                            <Link
                                href="/legal/privacy"
                                className="text-sm text-fg-muted hover:text-fg transition-colors"
                            >
                                Конфиденциальность
                            </Link>
                            <Link
                                href="/auth"
                                className="text-sm text-primary hover:text-primary font-medium transition-colors"
                            >
                                Вход
                            </Link>
                        </nav>
                    </div>
                </div>
            </header>

            {/* Main content */}
            <main>{children}</main>

            {/* Footer */}
            <footer className="bg-surface border-t border-line mt-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="flex flex-col md:flex-row justify-between items-center">
                        <p className="text-sm text-fg-muted">
                            © 2026 BURCEV. Все права защищены.
                        </p>
                        <div className="flex space-x-6 mt-4 md:mt-0">
                            <Link
                                href="/legal/terms"
                                className="text-sm text-fg-muted hover:text-fg"
                            >
                                Договор оферты
                            </Link>
                            <Link
                                href="/legal/privacy"
                                className="text-sm text-fg-muted hover:text-fg"
                            >
                                Конфиденциальность
                            </Link>
                            <a
                                href="mailto:support@burcev.team"
                                className="text-sm text-fg-muted hover:text-fg"
                            >
                                Поддержка
                            </a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
