import { z } from 'zod';

/**
 * Email validation schema
 * - Required: Must not be empty (min 1 character)
 * - Format: Must match email pattern
 * - Length: Max 100 characters
 *
 * Validates: Requirements AC-5.1, AC-2.2
 */
export const emailSchema = z
    .string()
    .min(1, 'Email is required')
    .email('Invalid email format')
    .max(100, 'Email too long');

/**
 * Password validation schema
 * - Required: Must not be empty
 * - Length: Min 6 characters, max 128 characters
 * - No format restrictions (allows special chars, emoji)
 *
 * Validates: Requirements AC-5.3, AC-2.2
 */
export const passwordSchema = z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(128, 'Password too long');

/**
 * Consent validation schema
 * - terms_of_service: Boolean (mandatory for registration)
 * - privacy_policy: Boolean (mandatory for registration)
 * - data_processing: Boolean (mandatory for registration)
 * - marketing: Boolean (optional)
 *
 * Validates: Requirements AC-2.3, AC-2.4
 */
export const consentSchema = z.object({
    terms_of_service: z.boolean(),
    privacy_policy: z.boolean(),
    data_processing: z.boolean(),
    marketing: z.boolean(),
});

/**
 * Login validation schema
 * - Requires valid email and password
 * - No consent validation (consents given at registration)
 *
 * Validates: Requirements AC-1.1, AC-1.2, AC-1.7
 */
export const loginSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
});

/**
 * Registration validation schema
 * - Requires valid email and password
 * - Requires all three mandatory consents to be checked
 * - Marketing consent is optional
 *
 * Validates: Requirements AC-2.1, AC-2.2, AC-2.3, AC-2.4, AC-2.5
 */
export const registerSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
    consents: consentSchema.refine(
        (data) => data.terms_of_service && data.privacy_policy && data.data_processing,
        {
            message: 'All mandatory consents must be checked',
            path: ['consents'],
        }
    ),
});

/**
 * TypeScript types inferred from Zod schemas
 */
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ConsentState = z.infer<typeof consentSchema>;
