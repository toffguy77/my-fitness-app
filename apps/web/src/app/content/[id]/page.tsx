'use client'

import { use } from 'react'
import { ArticleView } from '@/features/content/components/ArticleView'

export default function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    return <ArticleView articleId={id} />
}
