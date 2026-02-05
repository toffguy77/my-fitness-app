/**
 * Custom hook for automatically marking visible notifications as read
 * Uses Intersection Observer to detect visibility and debounces mark as read calls
 */

import { useEffect, useRef, useCallback } from 'react';
import { useNotificationsStore } from '../store/notificationsStore';
import type { Notification, NotificationCategory } from '../types';

export interface UseAutoMarkAsReadOptions {
    /**
     * Delay in milliseconds before marking as read
     * @default 2000 (2 seconds)
     */
    delay?: number;

    /**
     * Whether auto-mark is enabled
     * @default true
     */
    enabled?: boolean;
}

/**
 * Hook to automatically mark visible unread notifications as read
 * Uses Intersection Observer to detect when notifications are visible
 * Debounces mark as read calls to avoid excessive API requests
 *
 * @param notifications - Array of notifications to monitor
 * @param category - The notification category
 * @param options - Configuration options
 */
export function useAutoMarkAsRead(
    notifications: Notification[],
    category: NotificationCategory,
    options: UseAutoMarkAsReadOptions = {}
): void {
    const { delay = 2000, enabled = true } = options;

    const markAsRead = useNotificationsStore((state) => state.markAsRead);

    // Track which notifications are currently visible
    const visibleNotificationsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

    // Track notification elements
    const observerRef = useRef<IntersectionObserver | null>(null);
    const elementRefsRef = useRef<Map<string, Element>>(new Map());

    // Cleanup function to clear all pending timeouts
    const clearAllTimeouts = useCallback(() => {
        visibleNotificationsRef.current.forEach((timeout) => {
            clearTimeout(timeout);
        });
        visibleNotificationsRef.current.clear();
    }, []);

    // Handle intersection changes
    const handleIntersection = useCallback(
        (entries: IntersectionObserverEntry[]) => {
            if (!enabled) return;

            entries.forEach((entry) => {
                const notificationId = entry.target.getAttribute('data-notification-id');
                if (!notificationId) return;

                const notification = notifications.find((n) => n.id === notificationId);
                if (!notification || notification.readAt) return;

                if (entry.isIntersecting) {
                    // Notification became visible - start timer
                    if (!visibleNotificationsRef.current.has(notificationId)) {
                        const timeout = setTimeout(() => {
                            markAsRead(notificationId, category);
                            visibleNotificationsRef.current.delete(notificationId);
                        }, delay);

                        visibleNotificationsRef.current.set(notificationId, timeout);
                    }
                } else {
                    // Notification is no longer visible - cancel timer
                    const timeout = visibleNotificationsRef.current.get(notificationId);
                    if (timeout) {
                        clearTimeout(timeout);
                        visibleNotificationsRef.current.delete(notificationId);
                    }
                }
            });
        },
        [notifications, category, markAsRead, delay, enabled]
    );

    // Set up Intersection Observer
    useEffect(() => {
        if (!enabled) {
            clearAllTimeouts();
            return;
        }

        // Create observer
        observerRef.current = new IntersectionObserver(handleIntersection, {
            root: null, // viewport
            rootMargin: '0px',
            threshold: 0.5, // 50% visible
        });

        // Observe all notification elements
        const elements = document.querySelectorAll('[data-notification-id]');
        elements.forEach((element) => {
            const notificationId = element.getAttribute('data-notification-id');
            if (notificationId) {
                observerRef.current?.observe(element);
                elementRefsRef.current.set(notificationId, element);
            }
        });

        // Cleanup
        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect();
                observerRef.current = null;
            }
            clearAllTimeouts();
            elementRefsRef.current.clear();
        };
    }, [notifications, enabled, handleIntersection, clearAllTimeouts]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            clearAllTimeouts();
        };
    }, [clearAllTimeouts]);
}
