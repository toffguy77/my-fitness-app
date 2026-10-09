import type { Metadata } from 'next'
import { DesignSystemReference } from './DesignSystemReference'

// Живой справочник дизайн-системы: роли, шрифты и компоненты в том виде, в
// каком их видит приложение, в обеих темах. Страница служебная — без данных
// пользователя и закрыта от поисковиков.
export const metadata: Metadata = {
    title: 'Дизайн-система',
    robots: { index: false, follow: false },
}

export default function DesignSystemPage() {
    return <DesignSystemReference />
}
