/**
 * FileAttachment Component
 *
 * Renders a file download link with name, size, and icon.
 * For images: shows a thumbnail preview.
 */

'use client'

import { FileDown } from 'lucide-react'
import type { MessageAttachment } from '../types'

// ============================================================================
// Types
// ============================================================================

interface FileAttachmentProps {
    attachment: MessageAttachment
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Check if a MIME type is an image
 */
function isImage(mimeType: string): boolean {
    return mimeType.startsWith('image/')
}

// ============================================================================
// Component
// ============================================================================

export function FileAttachment({ attachment }: FileAttachmentProps) {
    if (isImage(attachment.mime_type)) {
        return (
            <a
                href={attachment.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={attachment.file_url}
                    alt={attachment.file_name}
                    className="max-h-[240px] max-w-[240px] rounded-tile border border-line object-cover"
                    loading="lazy"
                />
                <span className="mt-1 block text-xs text-fg-muted tabular-nums">
                    {attachment.file_name} ({formatFileSize(attachment.file_size)})
                </span>
            </a>
        )
    }

    return (
        <a
            href={attachment.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-14 max-w-[280px] items-center gap-3 rounded-tile border border-line bg-surface px-3 py-2 transition-colors hover:bg-subtle"
        >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-subtle" aria-hidden="true">
                <FileDown className="h-[18px] w-[18px] text-fg-muted" strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-sm text-fg truncate">{attachment.file_name}</p>
                <p className="text-xs text-fg-muted tabular-nums">{formatFileSize(attachment.file_size)}</p>
            </div>
        </a>
    )
}
