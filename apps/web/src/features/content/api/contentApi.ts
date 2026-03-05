import { apiClient } from '@/shared/utils/api-client'
import type {
    Article,
    ArticlesListResponse,
    FeedResponse,
    CreateArticleRequest,
    UpdateArticleRequest,
    ScheduleArticleRequest,
} from '../types'

const ARTICLES_BASE = '/backend-api/v1/content/articles'
const FEED_BASE = '/backend-api/v1/content/feed'

export const contentApi = {
    // Curator/Admin
    createArticle: (req: CreateArticleRequest) =>
        apiClient.post<Article>(ARTICLES_BASE, req),

    getArticle: (id: string) =>
        apiClient.get<Article>(`${ARTICLES_BASE}/${id}`),

    listArticles: (status?: string, category?: string) => {
        const params = new URLSearchParams()
        if (status) params.set('status', status)
        if (category) params.set('category', category)
        const qs = params.toString()
        return apiClient.get<ArticlesListResponse>(`${ARTICLES_BASE}${qs ? `?${qs}` : ''}`)
    },

    updateArticle: (id: string, req: UpdateArticleRequest) =>
        apiClient.put<Article>(`${ARTICLES_BASE}/${id}`, req),

    deleteArticle: (id: string) =>
        apiClient.delete(`${ARTICLES_BASE}/${id}`),

    publishArticle: (id: string) =>
        apiClient.post(`${ARTICLES_BASE}/${id}/publish`, {}),

    scheduleArticle: (id: string, req: ScheduleArticleRequest) =>
        apiClient.post(`${ARTICLES_BASE}/${id}/schedule`, req),

    unpublishArticle: (id: string) =>
        apiClient.post(`${ARTICLES_BASE}/${id}/unpublish`, {}),

    // Client feed
    getFeed: (category?: string, limit = 20, offset = 0) => {
        const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
        if (category) params.set('category', category)
        return apiClient.get<FeedResponse>(`${FEED_BASE}?${params}`)
    },

    getFeedArticle: (id: string) =>
        apiClient.get<Article>(`${FEED_BASE}/${id}`),
}

const PUBLIC_CONTENT_BASE = '/backend-api/v1/public/content'

export const publicContentApi = {
    getFeed: (category?: string, limit = 20, offset = 0) => {
        const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
        if (category) params.set('category', category)
        return apiClient.get<FeedResponse>(`${PUBLIC_CONTENT_BASE}?${params}`)
    },

    getArticle: (id: string) =>
        apiClient.get<Article>(`${PUBLIC_CONTENT_BASE}/${id}`),
}
