'use client';

/**
 * ChatTab Component
 *
 * Chat interface with curator for food entry assistance.
 * Features message history, photo upload, and food suggestions.
 *
 * @module food-tracker/components/ChatTab
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Send, Image, Clock, CheckCircle, User, Bot, Plus } from 'lucide-react';
import type { FoodItem } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface ChatTabProps {
    /** Callback when a food item is selected from suggestions */
    onSelectFood: (food: FoodItem) => void;
    /** External send message function */
    onSendMessage?: (message: string, photo?: File) => Promise<ChatResponse>;
    /** Curator availability status */
    curatorAvailable?: boolean;
    /** Estimated response time in minutes */
    estimatedResponseTime?: number;
    /** Additional CSS classes */
    className?: string;
}

export interface ChatMessage {
    id: string;
    type: 'user' | 'curator' | 'system';
    content: string;
    timestamp: Date;
    photo?: string;
    suggestions?: FoodItem[];
}

export interface ChatResponse {
    message: string;
    suggestions?: FoodItem[];
}

// ============================================================================
// Constants
// ============================================================================

const INITIAL_MESSAGES: ChatMessage[] = [
    {
        id: 'welcome',
        type: 'system',
        content: 'Опишите, что вы съели, и я помогу добавить это в дневник.',
        timestamp: new Date(),
    },
];

// ============================================================================
// Component
// ============================================================================

export function ChatTab({
    onSelectFood,
    onSendMessage,
    curatorAvailable = true,
    estimatedResponseTime = 5,
    className = '',
}: ChatTabProps) {
    const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
    const [inputValue, setInputValue] = useState('');
    const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [isSending, setIsSending] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Handle input change
    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
    }, []);

    // Handle photo selection
    const handlePhotoSelect = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    // Handle file input change
    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            setPhotoPreview(reader.result as string);
        };
        reader.readAsDataURL(file);

        setSelectedPhoto(file);
        e.target.value = '';
    }, []);

    // Remove selected photo
    const handleRemovePhoto = useCallback(() => {
        setSelectedPhoto(null);
        setPhotoPreview(null);
    }, []);

    // Send message
    const handleSendMessage = useCallback(async () => {
        const trimmedInput = inputValue.trim();
        if (!trimmedInput && !selectedPhoto) return;

        const userMessage: ChatMessage = {
            id: `user-${Date.now()}`,
            type: 'user',
            content: trimmedInput || 'Фото еды',
            timestamp: new Date(),
            photo: photoPreview || undefined,
        };

        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setSelectedPhoto(null);
        setPhotoPreview(null);
        setIsSending(true);

        try {
            if (onSendMessage) {
                const response = await onSendMessage(trimmedInput, selectedPhoto || undefined);

                const curatorMessage: ChatMessage = {
                    id: `curator-${Date.now()}`,
                    type: 'curator',
                    content: response.message,
                    timestamp: new Date(),
                    suggestions: response.suggestions,
                };

                setMessages(prev => [...prev, curatorMessage]);
            } else {
                // Mock response
                const mockMessage: ChatMessage = {
                    id: `curator-${Date.now()}`,
                    type: 'curator',
                    content: 'Куратор сейчас недоступен. Попробуйте позже или воспользуйтесь поиском.',
                    timestamp: new Date(),
                };

                setMessages(prev => [...prev, mockMessage]);
            }
        } catch {
            const errorMessage: ChatMessage = {
                id: `system-${Date.now()}`,
                type: 'system',
                content: 'Не удалось отправить сообщение. Попробуйте снова.',
                timestamp: new Date(),
            };

            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsSending(false);
            inputRef.current?.focus();
        }
    }, [inputValue, selectedPhoto, photoPreview, onSendMessage]);

    // Handle key press
    const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    }, [handleSendMessage]);

    // Handle food suggestion selection
    const handleSelectSuggestion = useCallback((food: FoodItem) => {
        onSelectFood(food);
    }, [onSelectFood]);

    // Format timestamp
    const formatTime = (date: Date): string => {
        return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className={`flex flex-col h-full ${className}`}>
            {/* Curator Status */}
            {!curatorAvailable && (
                <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 border-b border-yellow-200">
                    <Clock className="w-4 h-4 text-yellow-600" />
                    <span className="text-sm text-yellow-700">
                        Куратор ответит примерно через {estimatedResponseTime} мин
                    </span>
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map(message => (
                    <MessageBubble
                        key={message.id}
                        message={message}
                        onSelectSuggestion={handleSelectSuggestion}
                    />
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Photo Preview */}
            {photoPreview && (
                <div className="px-4 pb-2">
                    <div className="relative inline-block">
                        <img
                            src={photoPreview}
                            alt="Выбранное фото"
                            className="w-20 h-20 object-cover rounded-lg"
                        />
                        <button
                            type="button"
                            onClick={handleRemovePhoto}
                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                            aria-label="Удалить фото"
                        >
                            ×
                        </button>
                    </div>
                </div>
            )}

            {/* Input Area */}
            <div className="p-4 border-t border-gray-200">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handlePhotoSelect}
                        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        aria-label="Прикрепить фото"
                    >
                        <Image className="w-6 h-6" />
                    </button>
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyPress}
                        placeholder="Опишите, что вы съели..."
                        className="flex-1 px-4 py-2 bg-gray-100 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
                        aria-label="Сообщение"
                        disabled={isSending}
                    />
                    <button
                        type="button"
                        onClick={handleSendMessage}
                        disabled={isSending || (!inputValue.trim() && !selectedPhoto)}
                        className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        aria-label="Отправить"
                    >
                        <Send className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                aria-label="Выбрать фото"
            />
        </div>
    );
}

// ============================================================================
// Sub-components
// ============================================================================

interface MessageBubbleProps {
    message: ChatMessage;
    onSelectSuggestion: (food: FoodItem) => void;
}

function MessageBubble({ message, onSelectSuggestion }: MessageBubbleProps) {
    const isUser = message.type === 'user';
    const isSystem = message.type === 'system';

    return (
        <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div
                className={`max-w-[80%] ${isSystem
                        ? 'bg-gray-100 text-gray-600 text-center w-full rounded-lg'
                        : isUser
                            ? 'bg-blue-600 text-white rounded-2xl rounded-br-md'
                            : 'bg-gray-100 text-gray-900 rounded-2xl rounded-bl-md'
                    } px-4 py-3`}
            >
                {/* Avatar for curator */}
                {message.type === 'curator' && (
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                            <Bot className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-sm font-medium text-gray-700">Куратор</span>
                    </div>
                )}

                {/* Photo */}
                {message.photo && (
                    <img
                        src={message.photo}
                        alt="Прикрепленное фото"
                        className="w-full max-w-xs rounded-lg mb-2"
                    />
                )}

                {/* Content */}
                <p className={isSystem ? 'text-sm' : ''}>{message.content}</p>

                {/* Suggestions */}
                {message.suggestions && message.suggestions.length > 0 && (
                    <div className="mt-3 space-y-2">
                        <p className="text-sm text-gray-500">Предложения:</p>
                        {message.suggestions.map(food => (
                            <button
                                key={food.id}
                                type="button"
                                onClick={() => onSelectSuggestion(food)}
                                className="w-full flex items-center justify-between p-2 bg-white rounded-lg hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            >
                                <div className="flex items-center gap-2">
                                    <Plus className="w-4 h-4 text-blue-500" />
                                    <span className="text-gray-900">{food.name}</span>
                                </div>
                                <span className="text-sm text-gray-500">
                                    {Math.round(food.nutritionPer100.calories)} ккал
                                </span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Timestamp */}
                {!isSystem && (
                    <p className={`text-xs mt-1 ${isUser ? 'text-blue-200' : 'text-gray-400'}`}>
                        {message.timestamp.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                )}
            </div>
        </div>
    );
}

export default ChatTab;
