/**
 * Chat API client
 * Provides methods for conversation and message operations
 */

import { apiClient } from '@/shared/utils/api-client'
import type {
    Conversation,
    Message,
    MessageAttachment,
    SendMessageRequest,
    CreateFoodEntryRequest,
} from '../types'

const BASE = '/api/v1/conversations'

export const chatApi = {
    /**
     * Fetch all conversations for the current user
     */
    getConversations: () => apiClient.get<Conversation[]>(BASE),

    /**
     * Fetch messages for a conversation with cursor-based pagination
     */
    getMessages: (convId: string, cursor?: string, limit = 50) =>
        apiClient.get<Message[]>(
            `${BASE}/${convId}/messages?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`
        ),

    /**
     * Send a message to a conversation
     */
    sendMessage: (convId: string, data: SendMessageRequest) =>
        apiClient.post<Message>(`${BASE}/${convId}/messages`, data),

    /**
     * Upload a file attachment to a conversation
     * Uses raw fetch since apiClient doesn't support FormData
     */
    uploadFile: async (convId: string, file: File): Promise<MessageAttachment> => {
        const formData = new FormData()
        formData.append('file', file)
        const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
        const res = await fetch(`/api/v1/conversations/${convId}/upload`, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
        })
        if (!res.ok) throw new Error('Upload failed')
        const json = await res.json()
        return json.data ?? json
    },

    /**
     * Mark all messages in a conversation as read
     */
    markAsRead: (convId: string) => apiClient.post(`${BASE}/${convId}/read`, {}),

    /**
     * Get total unread message count across all conversations
     */
    getUnreadCount: () => apiClient.get<{ count: number }>(`${BASE}/unread`),

    /**
     * Create a food entry from a message
     */
    createFoodEntry: (convId: string, msgId: string, data: CreateFoodEntryRequest) =>
        apiClient.post<Message>(`${BASE}/${convId}/messages/${msgId}/food-entry`, data),
}
