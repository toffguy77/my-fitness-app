/**
 * Chat feature public API
 *
 * This barrel file exports the public interface of the chat feature.
 * Components, hooks, store, and utilities should be imported through this file.
 */

// Types
export type {
    Conversation,
    Message,
    MessageAttachment,
    SendMessageRequest,
    CreateFoodEntryRequest,
    WebSocketEvent,
} from './types'

// API
export { chatApi } from './api/chatApi'

// Store
export { useChatStore } from './store/chatStore'

// Hooks
export { useWebSocket } from './hooks/useWebSocket'
export { useChat } from './hooks/useChat'
export { useUnreadCount } from './hooks/useUnreadCount'

// Components
export { MessageBubble } from './components/MessageBubble'
export { MessageList } from './components/MessageList'
export { ChatInput } from './components/ChatInput'
export { FoodEntryCard } from './components/FoodEntryCard'
export { FileAttachment } from './components/FileAttachment'
export { TypingIndicator } from './components/TypingIndicator'
