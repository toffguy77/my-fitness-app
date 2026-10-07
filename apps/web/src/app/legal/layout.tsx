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
            <header className="border-b border-line bg-nav backdrop-blur">
                <div className="mx-auto flex h-16 max-w-content items-center justify-between gap-4 px-screen-x">
                    <Link href="/" className="flex min-h-11 items-center" aria-label="BURCEV">
                        <Logo width={112} height={34} className="text-fg" />
                    </Link>
                    <nav className="flex items-center gap-4 sm:gap-6">
                        <Link
                            href="/legal/terms"
                            className="hidden min-h-11 items-center text-sm text-fg-muted transition-colors hover:text-fg sm:inline-flex"
                        >
                            Договор оферты
                        </Link>
                        <Link
                            href="/legal/privacy"
                            className="hidden min-h-11 items-center text-sm text-fg-muted transition-colors hover:text-fg sm:inline-flex"
                        >
                            Конфиденциальность
                        </Link>
                        <Link
                            href="/auth"
                            className="inline-flex min-h-11 items-center text-sm font-semibold text-primary transition-colors"
                        >
                            Вход
                        </Link>
                    </nav>
                </div>
            </header>

            {/* Main content */}
            <main>{children}</main>

            {/* Footer */}
            <footer className="mt-12 border-t border-line">
                <div className="mx-auto flex max-w-content flex-col items-center justify-between gap-2 px-screen-x py-8 md:flex-row">
                    <p className="text-sm text-fg-muted">
                        © 2026 BURCEV. Все права защищены.
                    </p>
                    <div className="flex gap-6">
                        <Link
                            href="/legal/terms"
                            className="inline-flex min-h-11 items-center text-sm text-fg-muted hover:text-fg"
                        >
                            Договор оферты
                        </Link>
                        <Link
                            href="/legal/privacy"
                            className="inline-flex min-h-11 items-center text-sm text-fg-muted hover:text-fg"
                        >
                            Конфиденциальность
                        </Link>
                        <a
                            href="mailto:support@burcev.team"
                            className="inline-flex min-h-11 items-center text-sm text-fg-muted hover:text-fg"
                        >
                            Поддержка
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
