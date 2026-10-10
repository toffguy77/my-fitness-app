'use client'

import Link from 'next/link'
import { Pencil } from 'lucide-react'
import { useCurrentUser } from '@/shared/hooks/useCurrentUser'
import { useSession } from '@/shared/hooks/useSession'
import { articleEditPath } from '@/features/content/utils/articlePath'

interface ArticleEditLinkProps {
    articleId: string
    /** The article's own page, where the editor returns after saving. */
    from: string
}

/**
 * «Редактировать» on the page of an article, for curators and admins.
 *
 * The page itself is rendered on the server for everyone, crawlers included;
 * the button appears in the browser once the role is known. A visitor is not
 * asked who they are at all — the session check answers that without a
 * request to /auth/me.
 */
export function ArticleEditLink({ articleId, from }: ArticleEditLinkProps) {
    const session = useSession()
    if (session !== 'authenticated') return null
    return <EditorOnlyLink articleId={articleId} from={from} />
}

function EditorOnlyLink({ articleId, from }: ArticleEditLinkProps) {
    const { user } = useCurrentUser()
    const href = articleEditPath(user?.role, articleId, from)
    if (!href) return null

    return (
        <Link
            href={href}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3 text-sm font-semibold text-fg transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            Редактировать
        </Link>
    )
}
