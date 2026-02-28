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
                    className="max-w-[240px] max-h-[240px] rounded-lg object-cover"
                    loading="lazy"
                />
                <span className="text-xs text-gray-500 mt-1 block">
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
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors max-w-[280px]"
        >
            <FileDown className="w-5 h-5 text-gray-500 shrink-0" />
            <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-900 truncate">{attachment.file_name}</p>
                <p className="text-xs text-gray-500">{formatFileSize(attachment.file_size)}</p>
            </div>
        </a>
    )
}
