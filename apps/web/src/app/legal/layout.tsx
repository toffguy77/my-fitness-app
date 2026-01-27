import Link from 'next/link';
import { Logo } from '@/shared/components/ui';

export default function LegalLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header with navigation */}
            <header className="bg-white border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <Link href="/" className="flex items-center">
                            <Logo width={120} height={36} className="text-gray-900" />
                        </Link>
                        <nav className="flex space-x-6">
                            <Link
                                href="/legal/terms"
                                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                            >
                                Договор оферты
                            </Link>
                            <Link
                                href="/legal/privacy"
                                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                            >
                                Конфиденциальность
                            </Link>
                            <Link
                                href="/auth"
                                className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
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
            <footer className="bg-white border-t border-gray-200 mt-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="flex flex-col md:flex-row justify-between items-center">
                        <p className="text-sm text-gray-500">
                            © 2026 BURCEV. Все права защищены.
                        </p>
                        <div className="flex space-x-6 mt-4 md:mt-0">
                            <Link
                                href="/legal/terms"
                                className="text-sm text-gray-500 hover:text-gray-700"
                            >
                                Договор оферты
                            </Link>
                            <Link
                                href="/legal/privacy"
                                className="text-sm text-gray-500 hover:text-gray-700"
                            >
                                Конфиденциальность
                            </Link>
                            <a
                                href="mailto:support@burcev.team"
                                className="text-sm text-gray-500 hover:text-gray-700"
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
