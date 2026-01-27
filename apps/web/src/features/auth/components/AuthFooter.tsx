/**
 * Authentication footer component
 * Renders support contact link
 *
 * Validates: Requirements AC-6.1, AC-6.2, AC-6.3
 */

'use client';

export function AuthFooter() {
    const supportEmail = 'support@burcev.team';

    return (
        <footer className="mt-8 border-t border-gray-200 pt-6 text-center">
            <p className="text-sm text-gray-600">
                Нужна помощь?{' '}
                <a
                    href={`mailto:${supportEmail}`}
                    className="text-blue-600 hover:text-blue-700 hover:underline"
                >
                    Связаться с нами
                </a>
            </p>
        </footer>
    );
}
