import matter from 'gray-matter'
import type { ContentCategory, AudienceScope } from '@/features/content/types'

const VALID_CATEGORIES: ContentCategory[] = [
    'nutrition', 'training', 'recipes', 'health', 'motivation', 'general',
]
const VALID_AUDIENCES: AudienceScope[] = ['all', 'my_clients', 'selected']

export interface ParsedArticle {
    title?: string
    category?: ContentCategory
    excerpt?: string
    coverUrl?: string
    audience?: AudienceScope
    body: string
}

export function parseArticleMarkdown(raw: string): ParsedArticle {
    const { data, content } = matter(raw)

    // Extract title from first H1
    const h1Match = content.match(/^#\s+(.+)$/m)
    const title = h1Match ? h1Match[1].trim() : undefined

    // Remove the H1 line from body
    const body = h1Match
        ? content.replace(/^#\s+.+\n*/m, '').trim()
        : content.trim()

    // Validate category
    const category = VALID_CATEGORIES.includes(data.category)
        ? (data.category as ContentCategory)
        : undefined

    // Validate audience
    const audience = VALID_AUDIENCES.includes(data.audience)
        ? (data.audience as AudienceScope)
        : undefined

    return {
        title,
        category,
        excerpt: typeof data.excerpt === 'string' ? data.excerpt : undefined,
        coverUrl: typeof data.cover === 'string' ? data.cover : undefined,
        audience,
        body,
    }
}
