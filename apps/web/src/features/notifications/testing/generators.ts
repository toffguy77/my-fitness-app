/**
 * Property-based test generators for notifications
 * Uses fast-check to generate random test data
 */

import fc from 'fast-check';
import type {
    Notification,
    NotificationCategory,
    NotificationType,
    UnreadCounts,
} from '../types';

/**
 * Generate a random notification category
 */
export const categoryGenerator = (): fc.Arbitrary<NotificationCategory> => {
    return fc.constantFrom('main', 'content');
};

/**
 * Generate a random notification type
 */
export const typeGenerator = (): fc.Arbitrary<NotificationType> => {
    return fc.constantFrom(
        'trainer_feedback',
        'achievement',
        'reminder',
        'system_update',
        'new_feature',
        'general',
        'new_content'
    );
};

/**
 * Generate a safe icon URL that works with Next.js Image component
 * Uses null instead of random URLs to avoid hostname configuration issues
 */
const safeIconUrlGenerator = (): fc.Arbitrary<string | null | undefined> => {
    // Return null/undefined to avoid next/image hostname issues in tests
    return fc.constant(null);
};

/**
 * Generate a random notification
 */
export const notificationGenerator = (
    overrides?: Partial<Notification>
): fc.Arbitrary<Notification> => {
    const minTime = new Date('2024-01-01').getTime();
    const maxTime = Date.now();

    return fc.record({
        id: fc.uuid(),
        userId: fc.uuid(),
        category: categoryGenerator(),
        type: typeGenerator(),
        title: fc.string({ minLength: 5, maxLength: 100 }),
        content: fc.string({ minLength: 10, maxLength: 500 }),
        iconUrl: safeIconUrlGenerator(),
        createdAt: fc
            .integer({ min: minTime, max: maxTime })
            .map((timestamp) => new Date(timestamp).toISOString()),
        readAt: fc.option(
            fc.integer({ min: minTime, max: maxTime }).map((timestamp) => new Date(timestamp).toISOString()),
            { nil: undefined }
        ),
    }) as fc.Arbitrary<Notification>;
};

/**
 * Generate an unread notification (readAt is undefined)
 */
export const unreadNotificationGenerator = (): fc.Arbitrary<Notification> => {
    return fc.record({
        id: fc.uuid(),
        userId: fc.uuid(),
        category: categoryGenerator(),
        type: typeGenerator(),
        title: fc.string({ minLength: 5, maxLength: 100 }),
        content: fc.string({ minLength: 10, maxLength: 500 }),
        iconUrl: safeIconUrlGenerator(),
        createdAt: fc
            .integer({ min: new Date('2024-01-01').getTime(), max: Date.now() })
            .map((timestamp) => new Date(timestamp).toISOString()),
        readAt: fc.constant(undefined),
    }) as fc.Arbitrary<Notification>;
};

/**
 * Generate a read notification (readAt is set)
 */
export const readNotificationGenerator = (): fc.Arbitrary<Notification> => {
    const minTime = new Date('2024-01-01').getTime();
    const maxTime = Date.now();

    return fc.record({
        id: fc.uuid(),
        userId: fc.uuid(),
        category: categoryGenerator(),
        type: typeGenerator(),
        title: fc.string({ minLength: 5, maxLength: 100 }),
        content: fc.string({ minLength: 10, maxLength: 500 }),
        iconUrl: safeIconUrlGenerator(),
        createdAt: fc
            .integer({ min: minTime, max: maxTime })
            .map((timestamp) => new Date(timestamp).toISOString()),
        readAt: fc.integer({ min: minTime, max: maxTime }).map((timestamp) => new Date(timestamp).toISOString()),
    }) as fc.Arbitrary<Notification>;
};

/**
 * Generate an array of notifications
 */
export const notificationArrayGenerator = (
    minLength = 0,
    maxLength = 100
): fc.Arbitrary<Notification[]> => {
    return fc.array(notificationGenerator(), { minLength, maxLength });
};

/**
 * Generate unread counts
 */
export const unreadCountsGenerator = (): fc.Arbitrary<UnreadCounts> => {
    return fc.record({
        main: fc.integer({ min: 0, max: 100 }),
        content: fc.integer({ min: 0, max: 100 }),
    });
};

/**
 * Generate a timestamp in ISO 8601 format
 */
export const timestampGenerator = (
    minDate = new Date('2024-01-01'),
    maxDate = new Date()
): fc.Arbitrary<string> => {
    return fc
        .integer({ min: minDate.getTime(), max: maxDate.getTime() })
        .map((timestamp) => new Date(timestamp).toISOString());
};

/**
 * Generate a notification with a specific category
 */
export const notificationWithCategoryGenerator = (
    category: NotificationCategory
): fc.Arbitrary<Notification> => {
    const minTime = new Date('2024-01-01').getTime();
    const maxTime = Date.now();

    return fc.record({
        id: fc.uuid(),
        userId: fc.uuid(),
        category: fc.constant(category),
        type: typeGenerator(),
        title: fc.string({ minLength: 5, maxLength: 100 }),
        content: fc.string({ minLength: 10, maxLength: 500 }),
        iconUrl: safeIconUrlGenerator(),
        createdAt: fc
            .integer({ min: minTime, max: maxTime })
            .map((timestamp) => new Date(timestamp).toISOString()),
        readAt: fc.option(
            fc.integer({ min: minTime, max: maxTime }).map((timestamp) => new Date(timestamp).toISOString()),
            { nil: undefined }
        ),
    }) as fc.Arbitrary<Notification>;
};

/**
 * Generate a notification with a specific type
 */
export const notificationWithTypeGenerator = (
    type: NotificationType
): fc.Arbitrary<Notification> => {
    const minTime = new Date('2024-01-01').getTime();
    const maxTime = Date.now();

    return fc.record({
        id: fc.uuid(),
        userId: fc.uuid(),
        category: categoryGenerator(),
        type: fc.constant(type),
        title: fc.string({ minLength: 5, maxLength: 100 }),
        content: fc.string({ minLength: 10, maxLength: 500 }),
        iconUrl: safeIconUrlGenerator(),
        createdAt: fc
            .integer({ min: minTime, max: maxTime })
            .map((timestamp) => new Date(timestamp).toISOString()),
        readAt: fc.option(
            fc.integer({ min: minTime, max: maxTime }).map((timestamp) => new Date(timestamp).toISOString()),
            { nil: undefined }
        ),
    }) as fc.Arbitrary<Notification>;
};
