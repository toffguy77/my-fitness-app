/**
 * Property-based tests for icon mapping utility
 * Feature: notifications-page, Property 4: Notification Type Icon Mapping
 * Validates: Requirements 2.2, 8.1, 8.2, 8.3, 8.4, 8.5
 */

import fc from 'fast-check';
import { getNotificationIcon, getNotificationIconName } from '../iconMapping';
import { typeGenerator } from '../../testing/generators';
import type { NotificationType } from '../../types';
import {
    MessageSquare,
    Trophy,
    Bell,
    Settings,
    Star,
    Info,
    Newspaper,
} from 'lucide-react';

describe('iconMapping', () => {
    describe('Property 4: Notification Type Icon Mapping', () => {
        it('should always return a valid icon component for any notification type', () => {
            fc.assert(
                fc.property(
                    typeGenerator(),
                    (type) => {
                        const icon = getNotificationIcon(type);

                        // Property 1: Icon should always be defined
                        expect(icon).toBeDefined();

                        // Property 2: Icon should be an object or function (React component)
                        // Lucide React icons are objects with component properties
                        const isValidIcon = typeof icon === 'function' || typeof icon === 'object';
                        expect(isValidIcon).toBe(true);

                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should map each notification type to a specific icon', () => {
            const expectedMappings: Record<NotificationType, any> = {
                trainer_feedback: MessageSquare,
                achievement: Trophy,
                reminder: Bell,
                system_update: Settings,
                new_feature: Star,
                general: Info,
                new_content: Newspaper,
            };

            fc.assert(
                fc.property(
                    typeGenerator(),
                    (type) => {
                        const icon = getNotificationIcon(type);
                        const expectedIcon = expectedMappings[type];

                        // Property: Each type should map to its expected icon
                        expect(icon).toBe(expectedIcon);

                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should return consistent icons for the same type', () => {
            fc.assert(
                fc.property(
                    typeGenerator(),
                    (type) => {
                        const icon1 = getNotificationIcon(type);
                        const icon2 = getNotificationIcon(type);

                        // Property: Same type should always return the same icon
                        expect(icon1).toBe(icon2);

                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should return icon names as strings', () => {
            fc.assert(
                fc.property(
                    typeGenerator(),
                    (type) => {
                        const iconName = getNotificationIconName(type);

                        // Property 1: Icon name should be a non-empty string
                        expect(typeof iconName).toBe('string');
                        expect(iconName.length).toBeGreaterThan(0);

                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should have unique icons for different types', () => {
            const types: NotificationType[] = [
                'trainer_feedback',
                'achievement',
                'reminder',
                'system_update',
                'new_feature',
                'general',
            ];

            const icons = types.map((type) => getNotificationIcon(type));
            const uniqueIcons = new Set(icons);

            // Property: Each notification type should have a unique icon
            expect(uniqueIcons.size).toBe(types.length);
        });
    });

    describe('Specific icon mappings', () => {
        it('should map trainer_feedback to MessageSquare icon', () => {
            const icon = getNotificationIcon('trainer_feedback');
            expect(icon).toBe(MessageSquare);
        });

        it('should map achievement to Trophy icon', () => {
            const icon = getNotificationIcon('achievement');
            expect(icon).toBe(Trophy);
        });

        it('should map reminder to Bell icon', () => {
            const icon = getNotificationIcon('reminder');
            expect(icon).toBe(Bell);
        });

        it('should map system_update to Settings icon', () => {
            const icon = getNotificationIcon('system_update');
            expect(icon).toBe(Settings);
        });

        it('should map new_feature to Star icon', () => {
            const icon = getNotificationIcon('new_feature');
            expect(icon).toBe(Star);
        });

        it('should map general to Info icon', () => {
            const icon = getNotificationIcon('general');
            expect(icon).toBe(Info);
        });
    });

    describe('Fallback behavior', () => {
        it('should return Info icon for unknown types', () => {
            // Test with a type that doesn't exist in the mapping
            const unknownType = 'unknown_type' as NotificationType;
            const icon = getNotificationIcon(unknownType);
            expect(icon).toBe(Info);
        });
    });

    describe('Icon name retrieval', () => {
        it('should return correct icon names for all types', () => {
            const types: NotificationType[] = [
                'trainer_feedback',
                'achievement',
                'reminder',
                'system_update',
                'new_feature',
                'general',
            ];

            for (const type of types) {
                const iconName = getNotificationIconName(type);
                expect(iconName).toBeTruthy();
                expect(typeof iconName).toBe('string');
            }
        });
    });
});
