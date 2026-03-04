'use client'

import { FeedList } from '@/features/content/components/FeedList'

export default function ContentFeedPage() {
    return (
        <div className="px-4 py-6 pb-20">
            <h1 className="text-xl font-semibold text-gray-900 mb-4">Контент</h1>
            <FeedList />
        </div>
    )
}
