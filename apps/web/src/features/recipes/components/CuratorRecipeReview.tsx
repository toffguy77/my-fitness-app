'use client'

import { useCallback, useId, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/shared/components/ui/Button'
import { Spinner } from '@/shared/components/ui/Spinner'
import { ErrorState } from '@/shared/components/ErrorState'
import { fieldClass, fieldLabelClass } from '@/shared/components/forms/fieldStyles'
import { isApiError, messageForOr } from '@/shared/errors/apiErrors'
import { EVENTS, track } from '@/shared/analytics'
import { t } from '@/shared/i18n'
import { cn } from '@/shared/utils/cn'
import { curatorRecipesApi } from '../api/recipesApi'
import { useResource } from '../hooks/useResource'
import type { VersionInput } from '../types'
import { missingFields } from '../utils/recipeInput'
import { RecipeEditor } from './RecipeEditor'
import { RecipeView } from './RecipeView'

interface CuratorRecipeReviewProps {
    recipeId: string
}

type Mode = 'view' | 'edit' | 'return'

/**
 * Проверка рецепта куратором: одобрить как есть, поправить и одобрить, или
 * вернуть команде с комментарием.
 */
export function CuratorRecipeReview({ recipeId }: CuratorRecipeReviewProps) {
    const id = useId()
    const router = useRouter()
    const load = useCallback(() => curatorRecipesApi.get(recipeId), [recipeId])
    const { data: bundle, error, loading, reload } = useResource(load)
    const [mode, setMode] = useState<Mode>('view')
    const [comment, setComment] = useState('')
    const [commentError, setCommentError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [missing, setMissing] = useState<string[] | null>(null)

    const approve = async (version?: VersionInput) => {
        setBusy(true)
        setMissing(null)
        try {
            await curatorRecipesApi.approve(recipeId, version)
            track(EVENTS.recipeApproved)
            toast.success(t('recipes.review.approved'))
            router.push('/curator/recipes')
        } catch (err) {
            setMissing(missingFields(err))
            toast.error(
                isApiError(err) && err.status === 409
                    ? t('recipes.review.conflict')
                    : messageForOr(err, t('recipes.review.approveFailed'))
            )
            setBusy(false)
        }
    }

    const handleReturn = async () => {
        const text = comment.trim()
        if (!text) {
            setCommentError(t('recipes.review.returnNeedsComment'))
            return
        }
        setBusy(true)
        try {
            await curatorRecipesApi.returnToTeam(recipeId, text)
            toast.success(t('recipes.review.returned'))
            router.push('/curator/recipes')
        } catch (err) {
            toast.error(messageForOr(err, t('recipes.review.returnFailed')))
            setBusy(false)
        }
    }

    const back = (
        <Link
            href="/curator/recipes"
            aria-label={t('recipes.review.backToQueue')}
            className="-ml-2.5 inline-flex h-11 w-11 items-center justify-center rounded-full text-fg transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
            <ArrowLeft className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
        </Link>
    )

    if (loading && !bundle) {
        return (
            <div className="mx-auto w-full max-w-3xl px-screen-x py-5">
                <Spinner label={t('common.loading')} />
            </div>
        )
    }

    if (error || !bundle) {
        return (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-screen-x py-5">
                {back}
                <ErrorState variant="inline" title={t('recipes.review.loadFailed')} onRetry={reload} showHomeLink={false} />
            </div>
        )
    }

    const working = bundle.working
    const inReview = working?.state === 'review'

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-screen-x py-5">
            {back}

            {bundle.approved && (
                <p className="text-sm text-fg-muted">
                    {t('recipes.review.currentApproved', { version: bundle.approved.version })}
                </p>
            )}

            {!working ? (
                <p className="text-fg-muted">{t('recipes.review.noWorking')}</p>
            ) : mode === 'edit' ? (
                <RecipeEditor
                    initial={working}
                    mode="curator"
                    missing={missing}
                    actions={(getInput) => (
                        <>
                            <Button onClick={() => approve(getInput())} isLoading={busy}>
                                {t('recipes.review.saveAndApprove')}
                            </Button>
                            <Button variant="ghost" onClick={() => setMode('view')} disabled={busy}>
                                {t('recipes.review.cancelEdit')}
                            </Button>
                        </>
                    )}
                />
            ) : (
                <>
                    <span className="self-start rounded-full bg-subtle px-2.5 py-0.5 text-sm font-medium text-fg-muted">
                        {t('recipes.admin.versionState', {
                            version: working.version,
                            state: t(`recipes.states.${working.state}`),
                        })}
                    </span>

                    <RecipeView version={working} />

                    {!inReview ? (
                        <p className="text-fg-muted">{t('recipes.review.notInReview')}</p>
                    ) : mode === 'return' ? (
                        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
                            <label htmlFor={`${id}-comment`} className={fieldLabelClass}>
                                {t('recipes.review.returnComment')}
                            </label>
                            <textarea
                                id={`${id}-comment`}
                                value={comment}
                                onChange={(e) => {
                                    setComment(e.target.value)
                                    setCommentError(null)
                                }}
                                rows={4}
                                aria-invalid={!!commentError}
                                className={cn(fieldClass, 'h-auto py-3', commentError && 'border-danger')}
                            />
                            {commentError && (
                                <p role="alert" className="text-sm text-danger-fg">
                                    {commentError}
                                </p>
                            )}
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <Button onClick={handleReturn} isLoading={busy}>
                                    {t('recipes.review.returnSubmit')}
                                </Button>
                                <Button variant="ghost" onClick={() => setMode('view')} disabled={busy}>
                                    {t('common.cancel')}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                            <Button onClick={() => approve()} isLoading={busy}>
                                {t('recipes.review.approve')}
                            </Button>
                            <Button variant="secondary" onClick={() => setMode('edit')} disabled={busy}>
                                {t('recipes.review.editAndApprove')}
                            </Button>
                            <Button variant="ghost" onClick={() => setMode('return')} disabled={busy}>
                                {t('recipes.review.return')}
                            </Button>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
