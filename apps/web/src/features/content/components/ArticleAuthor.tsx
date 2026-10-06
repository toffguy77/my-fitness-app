import Link from 'next/link'
import Image from 'next/image'
import type { ExpertAuthor } from '@/shared/constants/author'

/**
 * Who wrote the article, and why they may be trusted on it.
 *
 * For health topics search engines weigh the author's expertise, and so do
 * readers: a name, a qualification and a page about the person.
 */
export function ArticleAuthor({ author }: { author: ExpertAuthor }) {
    return (
        <div className="flex items-center gap-3">
            {author.photo ? (
                <Image
                    src={author.photo}
                    alt={author.name}
                    width={48}
                    height={48}
                    className="h-12 w-12 rounded-full object-cover"
                />
            ) : (
                <span
                    aria-hidden="true"
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700"
                >
                    {author.initials}
                </span>
            )}
            <div className="text-sm">
                <Link href={author.path} className="font-medium text-gray-900 hover:underline">
                    {author.name}
                </Link>
                <p className="text-gray-500">{author.jobTitle}</p>
            </div>
        </div>
    )
}
