/**
 * Chat feature type definitions
 * Matches the backend API response types for conversations and messages
 */

// ============================================================================
// Core Types
// ============================================================================

export interface Conversation {
    id: string
    client_id: number
    curator_id: number
    last_message?: Message
    unread_count: number
    participant: {
        id: number
        name: string
        avatar_url?: string
    }
    created_at: string
    updated_at: string
}

export interface Message {
    id: string
    conversation_id: string
    sender_id: number
    type: 'text' | 'image' | 'file' | 'food_entry'
    content?: string
    metadata?: Record<string, unknown>
    attachments?: MessageAttachment[]
    created_at: string
}

export interface MessageAttachment {
    id: string
    file_url: string
    file_name: string
    file_size: number
    mime_type: string
}

// ============================================================================
// Request Types
// ============================================================================

export interface SendMessageRequest {
    type: 'text' | 'image' | 'file'
    content?: string
}

export interface CreateFoodEntryRequest {
    food_name: string
    meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
    weight: number
    calories: number
    protein: number
    fat: number
    carbs: number
}

// ============================================================================
// WebSocket Types
// ============================================================================

export interface WebSocketEvent {
    type: string
    data: Record<string, unknown>
}
