/**
 * Icon mapping utility for notifications
 * Maps notification types to Lucide React icon names
 */

import type { NotificationType } from '../types';
import type { LucideIcon } from 'lucide-react';
import {
    MessageSquare,
    Trophy,
    Bell,
    Settings,
    Star,
    Info,
    Newspaper,
    ClipboardList,
    AlertTriangle,
    CalendarCheck,
    MessageCircle,
} from 'lucide-react';

/**
 * Maps notification types to their corresponding Lucide React icons
 */
const iconMap: Record<NotificationType, LucideIcon> = {
    trainer_feedback: MessageSquare,
    achievement: Trophy,
    reminder: Bell,
    system_update: Settings,
    new_feature: Star,
    general: Info,
    new_content: Newspaper,
    task_assigned: ClipboardList,
    task_overdue: AlertTriangle,
    plan_updated: CalendarCheck,
    feedback_received: MessageCircle,
};

/**
 * Gets the appropriate Lucide React icon component for a notification type
 * @param type - Notification type
 * @returns Lucide icon component
 */
export function getNotificationIcon(type: NotificationType): LucideIcon {
    return iconMap[type] || Info; // Fallback to Info icon for unknown types
}

/**
 * Gets the icon name as a string for a notification type
 * Useful for testing and debugging
 * @param type - Notification type
 * @returns Icon name as string
 */
export function getNotificationIconName(type: NotificationType): string {
    const icon = getNotificationIcon(type);
    return icon.displayName || icon.name || 'Info';
}
