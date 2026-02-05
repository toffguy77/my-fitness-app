/**
 * Timestamp formatting utility for notifications
 * Formats timestamps in relative format for better readability
 */

/**
 * Formats a timestamp as relative time (e.g., "just now", "2 hours ago", "Yesterday")
 * @param timestamp - ISO 8601 timestamp string
 * @returns Formatted relative time string
 */
export function formatRelativeTime(timestamp: string): string {
    const now = new Date();
    const date = new Date(timestamp);
    const diffInMs = now.getTime() - date.getTime();
    const diffInSeconds = Math.floor(diffInMs / 1000);
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);

    // Just now (< 1 minute)
    if (diffInSeconds < 60) {
        return 'just now';
    }

    // X minutes ago (< 1 hour)
    if (diffInMinutes < 60) {
        return formatWithIntl(-diffInMinutes, 'minute');
    }

    // X hours ago (< 24 hours)
    if (diffInHours < 24) {
        return formatWithIntl(-diffInHours, 'hour');
    }

    // Yesterday (24-48 hours)
    if (diffInDays === 1) {
        return 'Yesterday';
    }

    // X days ago (< 7 days)
    if (diffInDays < 7) {
        return formatWithIntl(-diffInDays, 'day');
    }

    // X weeks ago (< 30 days)
    if (diffInDays < 30) {
        const weeks = Math.floor(diffInDays / 7);
        return formatWithIntl(-weeks, 'week');
    }

    // X months ago (< 365 days)
    if (diffInDays < 365) {
        const months = Math.floor(diffInDays / 30);
        return formatWithIntl(-months, 'month');
    }

    // X years ago
    const years = Math.floor(diffInDays / 365);
    return formatWithIntl(-years, 'year');
}

/**
 * Formats relative time using Intl.RelativeTimeFormat for internationalization
 * @param value - Negative number representing time in the past
 * @param unit - Time unit (minute, hour, day, week, month, year)
 * @returns Formatted relative time string
 */
function formatWithIntl(
    value: number,
    unit: Intl.RelativeTimeFormatUnit
): string {
    try {
        const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
        return rtf.format(value, unit);
    } catch (error) {
        // Fallback if Intl.RelativeTimeFormat is not supported
        const absValue = Math.abs(value);
        const unitStr = absValue === 1 ? unit : `${unit}s`;
        return `${absValue} ${unitStr} ago`;
    }
}
