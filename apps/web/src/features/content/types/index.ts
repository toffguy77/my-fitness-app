export type ContentCategory = 'nutrition' | 'training' | 'recipes' | 'health' | 'motivation' | 'general'

export type ContentStatus = 'draft' | 'scheduled' | 'published'

export type AudienceScope = 'all' | 'my_clients' | 'selected'

export interface Article {
  id: string
  author_id: number
  author_name: string
  title: string
  excerpt: string
  cover_image_url?: string
  category: ContentCategory
  status: ContentStatus
  audience_scope: AudienceScope
  body?: string
  scheduled_at?: string
  published_at?: string
  created_at: string
  updated_at: string
}

export interface ArticleCard {
  id: string
  author_name: string
  title: string
  excerpt: string
  cover_image_url?: string
  category: ContentCategory
  published_at?: string
}

export interface CreateArticleRequest {
  title: string
  excerpt?: string
  body?: string
  category: ContentCategory
  audience_scope: AudienceScope
  client_ids?: number[]
}

export interface UpdateArticleRequest {
  title?: string
  excerpt?: string
  body?: string
  category?: ContentCategory
  audience_scope?: AudienceScope
  client_ids?: number[]
  cover_image_url?: string
}

export interface ScheduleArticleRequest {
  scheduled_at: string
}

export interface FeedResponse {
  articles: ArticleCard[]
  total: number
}

export interface ArticlesListResponse {
  articles: Article[]
  total: number
}

export const CATEGORY_LABELS: Record<ContentCategory, string> = {
  nutrition: 'Питание',
  training: 'Тренировки',
  recipes: 'Рецепты',
  health: 'Здоровье',
  motivation: 'Мотивация',
  general: 'Общее',
}
