import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                allow: ['/', '/auth', '/legal/', '/content/'],
                disallow: [
                    '/dashboard',
                    '/food-tracker',
                    '/notifications',
                    '/profile',
                    '/settings',
                    '/chat',
                    '/curator',
                    '/admin',
                    '/onboarding',
                    '/forgot-password',
                    '/reset-password',
                    '/api/',
                ],
            },
            {
                userAgent: 'Yandex',
                allow: ['/', '/auth', '/legal/', '/content/'],
                disallow: [
                    '/dashboard',
                    '/food-tracker',
                    '/notifications',
                    '/profile',
                    '/settings',
                    '/chat',
                    '/curator',
                    '/admin',
                    '/onboarding',
                    '/forgot-password',
                    '/reset-password',
                    '/api/',
                ],
                crawlDelay: 2,
            },
        ],
        sitemap: 'https://burcev.team/sitemap.xml',
        host: 'https://burcev.team',
    }
}
