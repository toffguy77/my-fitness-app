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
import { Send, Image as ImageIcon, Clock, Bot, Plus, X } from 'lucide-react';
import type { FoodItem } from '../types';
import { t } from '@/shared/i18n'
import { IconButton } from '@/shared/components/ui/Button';
import { messageForOr } from '@/shared/errors/apiErrors';

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
        content: t('foodTracker.chat.greeting'),
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
            content: trimmedInput || t('foodTracker.chat.photoPlaceholder'),
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
                    content: t('foodTracker.chat.curatorUnavailable'),
                    timestamp: new Date(),
                };

                setMessages(prev => [...prev, mockMessage]);
            }
        } catch (err) {
            const errorMessage: ChatMessage = {
                id: `system-${Date.now()}`,
                type: 'system',
                // «Попробуйте снова» бесполезно, когда сервер сказал «подождите
                // до завтра» или «слишком часто»: человек жмёт ещё раз впустую.
                content: messageForOr(err, t('foodTracker.chat.sendFailed')),
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

    return (
        <div className={`flex flex-col h-full ${className}`}>
            {/* Curator Status */}
            {!curatorAvailable && (
                <div className="flex items-center gap-2 rounded-tile bg-info-soft px-4 py-2.5">
                    <Clock className="h-4 w-4 shrink-0 text-info-fg" strokeWidth={1.8} aria-hidden="true" />
                    <span className="text-sm text-info-fg tabular-nums">
                        {t('foodTracker.chat.responseTime', { minutes: estimatedResponseTime })}
                    </span>
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 space-y-3 overflow-y-auto py-4">
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
                <div className="pb-2 pt-2">
                    <div className="relative inline-block">
                        {/* eslint-disable-next-line @next/next/no-img-element -- локальный предпросмотр: data: URL из FileReader, оптимизатору next/image его не отдать */}
                        <img
                            src={photoPreview}
                            alt={t('foodTracker.chat.chosenPhoto')}
                            className="h-20 w-20 rounded-tile object-cover"
                        />
                        {/* Круг 44 px вокруг значка 24 px: цель нажатия больше видимой метки. */}
                        <button
                            type="button"
                            onClick={handleRemovePhoto}
                            className="group absolute -right-3.5 -top-3.5 flex h-11 w-11 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-focus touch-manipulation"
                            aria-label={t('foodTracker.chat.removePhoto')}
                        >
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-fg text-fg-inverse transition-opacity group-hover:opacity-80">
                                <X className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                            </span>
                        </button>
                    </div>
                </div>
            )}

            {/* Input Area */}
            <div className="border-t border-line pt-3">
                <div className="flex items-center gap-2">
                    <IconButton
                        variant="ghost"
                        onClick={handlePhotoSelect}
                        aria-label={t('foodTracker.chat.attachPhoto')}
                    >
                        <ImageIcon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                    </IconButton>
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyPress}
                        placeholder={t('foodTracker.chat.inputPlaceholder')}
                        className="h-12 min-w-0 flex-1 rounded-field border border-line bg-surface px-4 text-base text-fg placeholder:text-fg-subtle transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30 disabled:opacity-50"
                        aria-label={t('foodTracker.chat.message')}
                        disabled={isSending}
                    />
                    <IconButton
                        variant="primary"
                        onClick={handleSendMessage}
                        disabled={isSending || (!inputValue.trim() && !selectedPhoto)}
                        aria-label={t('foodTracker.chat.send')}
                    >
                        <Send className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                    </IconButton>
                </div>
            </div>

            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
                aria-label={t('foodTracker.chat.choosePhoto')}
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
            {/* Как в чате с куратором: своё — чернилами, чужое — на бумаге. */}
            <div
                className={`max-w-[80%] ${isSystem
                        ? 'w-full rounded-tile bg-subtle text-center text-fg-muted'
                        : isUser
                            ? 'rounded-card rounded-br-md bg-fg text-fg-inverse'
                            : 'rounded-card rounded-bl-md border border-line bg-surface text-fg'
                    } px-4 py-3`}
            >
                {/* Avatar for curator */}
                {message.type === 'curator' && (
                    <div className="flex items-center gap-2 mb-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-coach">
                            <Bot className="h-4 w-4 text-on-coach" strokeWidth={1.8} aria-hidden="true" />
                        </div>
                        <span className="text-sm font-medium text-fg">{t('foodTracker.chat.curator')}</span>
                    </div>
                )}

                {/* Photo */}
                {message.photo && (
                    // eslint-disable-next-line @next/next/no-img-element -- локальный предпросмотр: data: URL из FileReader, оптимизатору next/image его не отдать
                    <img
                        src={message.photo}
                        alt={t('foodTracker.chat.attachedPhoto')}
                        className="mb-2 w-full max-w-xs rounded-tile"
                    />
                )}

                {/* Content */}
                <p className={isSystem ? 'text-sm' : ''}>{message.content}</p>

                {/* Suggestions */}
                {message.suggestions && message.suggestions.length > 0 && (
                    <div className="mt-3 space-y-2">
                        <p className="text-sm text-fg-muted">{t('foodTracker.chat.suggestions')}</p>
                        {message.suggestions.map(food => (
                            <button
                                key={food.id}
                                type="button"
                                onClick={() => onSelectSuggestion(food)}
                                className="flex min-h-11 w-full items-center justify-between gap-2 rounded-tile border border-line bg-surface px-3 py-2 text-left transition-colors hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                            >
                                <div className="flex min-w-0 items-center gap-2">
                                    <Plus className="h-4 w-4 shrink-0 text-fg-subtle" strokeWidth={2} aria-hidden="true" />
                                    <span className="truncate text-fg">{food.name}</span>
                                </div>
                                <span className="shrink-0 text-sm text-fg-muted tabular-nums">
                                    {Math.round(food.nutritionPer100.calories)} {t('units.kcal')}
                                </span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Timestamp */}
                {!isSystem && (
                    <p className={`mt-1 text-xs tabular-nums ${isUser ? 'text-fg-inverse/70' : 'text-fg-subtle'}`}>
                        {message.timestamp.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                )}
            </div>
        </div>
    );
}

export default ChatTab;
