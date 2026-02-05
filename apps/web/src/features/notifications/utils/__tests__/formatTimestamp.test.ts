/**
 * Property-based tests for timestamp formatting utility
 * Feature: notifications-page, Property 3: Timestamp Formatting
 * Validates: Requirements 2.1
 */

import fc from 'fast-check';
import { formatRelativeTime } from '../formatTimestamp';

describe('formatTimestamp', () => {
    describe('Property 3: Timestamp Formatting', () => {
        it('should always return a non-empty string for valid timestamps', () => {
            fc.assert(
                fc.property(
                    fc.date({ min: new Date('2020-01-01'), max: new Date() }),
                    (date) => {
                        // Skip invalid dates
                        if (isNaN(date.getTime())) {
                            return true;
                        }

                        const timestamp = date.toISOString();
                        const result = formatRelativeTime(timestamp);

                        // Property 1: Result should always be a non-empty string
                        expect(typeof result).toBe('string');
                        expect(result.length).toBeGreaterThan(0);

                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should return "just now" for very recent timestamps', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 59 }), // 0-59 seconds ago
                    (secondsAgo) => {
                        const now = new Date();
                        const timestamp = new Date(now.getTime() - secondsAgo * 1000).toISOString();
                        const result = formatRelativeTime(timestamp);

                        expect(result).toBe('just now');
                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should return minutes format for timestamps within the last hour', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 59 }), // 1-59 minutes ago
                    (minutesAgo) => {
                        const now = new Date();
                        const timestamp = new Date(now.getTime() - minutesAgo * 60 * 1000).toISOString();
                        const result = formatRelativeTime(timestamp);

                        // Should contain "minute" or "minutes"
                        expect(result.toLowerCase()).toMatch(/minute/);
                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should return hours format for timestamps within the last 24 hours', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 23 }), // 1-23 hours ago
                    (hoursAgo) => {
                        const now = new Date();
                        const timestamp = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000).toISOString();
                        const result = formatRelativeTime(timestamp);

                        // Should contain "hour" or "hours"
                        expect(result.toLowerCase()).toMatch(/hour/);
                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should return "Yesterday" for timestamps 24-48 hours ago', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 24, max: 47 }), // 24-47 hours ago
                    (hoursAgo) => {
                        const now = new Date();
                        const timestamp = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000).toISOString();
                        const result = formatRelativeTime(timestamp);

                        expect(result).toBe('Yesterday');
                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should return days format for timestamps within the last week', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 2, max: 6 }), // 2-6 days ago
                    (daysAgo) => {
                        const now = new Date();
                        const timestamp = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
                        const result = formatRelativeTime(timestamp);

                        // Should contain "day" or "days"
                        expect(result.toLowerCase()).toMatch(/day/);
                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should return weeks format for timestamps within the last month', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 7, max: 29 }), // 7-29 days ago
                    (daysAgo) => {
                        const now = new Date();
                        const timestamp = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
                        const result = formatRelativeTime(timestamp);

                        // Should contain "week" or "weeks"
                        expect(result.toLowerCase()).toMatch(/week/);
                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should return months format for timestamps within the last year', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 30, max: 364 }), // 30-364 days ago
                    (daysAgo) => {
                        const now = new Date();
                        const timestamp = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
                        const result = formatRelativeTime(timestamp);

                        // Should contain "month" or "months"
                        expect(result.toLowerCase()).toMatch(/month/);
                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should return years format for timestamps over a year ago', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 365, max: 1825 }), // 1-5 years ago
                    (daysAgo) => {
                        const now = new Date();
                        const timestamp = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
                        const result = formatRelativeTime(timestamp);

                        // Should contain "year" or "years"
                        expect(result.toLowerCase()).toMatch(/year/);
                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should handle timestamps in the past consistently', () => {
            fc.assert(
                fc.property(
                    fc.date({ min: new Date('2020-01-01'), max: new Date() }),
                    (date) => {
                        // Skip invalid dates
                        if (isNaN(date.getTime())) {
                            return true;
                        }

                        const timestamp = date.toISOString();
                        const result = formatRelativeTime(timestamp);

                        // Property: Result should indicate past time (contain "ago", "Yesterday", "just now", or relative time words)
                        const isPastIndicator =
                            result.includes('ago') ||
                            result === 'Yesterday' ||
                            result === 'just now' ||
                            result.includes('minute') ||
                            result.includes('hour') ||
                            result.includes('day') ||
                            result.includes('week') ||
                            result.includes('month') ||
                            result.includes('year');

                        expect(isPastIndicator).toBe(true);
                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });

        it('should be deterministic for the same timestamp', () => {
            fc.assert(
                fc.property(
                    fc.date({ min: new Date('2020-01-01'), max: new Date() }),
                    (date) => {
                        // Skip invalid dates
                        if (isNaN(date.getTime())) {
                            return true;
                        }

                        const timestamp = date.toISOString();
                        const result1 = formatRelativeTime(timestamp);
                        const result2 = formatRelativeTime(timestamp);

                        // Property: Same input should produce same output (within same execution context)
                        expect(result1).toBe(result2);
                        return true;
                    }
                ),
                { numRuns: 100 }
            );
        });
    });

    describe('Edge cases', () => {
        it('should handle current time', () => {
            const now = new Date().toISOString();
            const result = formatRelativeTime(now);
            expect(result).toBe('just now');
        });

        it('should handle 1 minute ago', () => {
            const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
            const result = formatRelativeTime(oneMinuteAgo);
            expect(result.toLowerCase()).toMatch(/minute/);
        });

        it('should handle 1 hour ago', () => {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
            const result = formatRelativeTime(oneHourAgo);
            expect(result.toLowerCase()).toMatch(/hour/);
        });

        it('should handle exactly 24 hours ago', () => {
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const result = formatRelativeTime(oneDayAgo);
            expect(result).toBe('Yesterday');
        });

        it('should handle old dates', () => {
            const oldDate = new Date('2020-01-01').toISOString();
            const result = formatRelativeTime(oldDate);
            expect(result.toLowerCase()).toMatch(/year/);
        });
    });
});
