import type { Metadata } from 'next'
import { FeedList } from '@/features/content/components/FeedList'

export const metadata: Metadata = {
    title: 'Статьи о фитнесе и питании',
    description:
        'Полезные статьи о правильном питании, тренировках, рецептах и здоровом образе жизни от экспертов BURCEV.',
    openGraph: {
        title: 'Статьи о фитнесе и питании | BURCEV',
        description: 'Полезные статьи о правильном питании, тренировках и здоровом образе жизни.',
        url: 'https://burcev.team/content',
    },
    alternates: {
        canonical: 'https://burcev.team/content',
    },
}

export default function ContentFeedPage() {
    return (
        <div className="px-4 py-6 pb-20">
            <h1 className="text-xl font-semibold text-gray-900 mb-4">Статьи</h1>
            <FeedList />
        </div>
    )
}
