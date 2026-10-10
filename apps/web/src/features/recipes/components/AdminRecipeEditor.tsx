'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, MessageSquareWarning } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/shared/components/ui/Button'
import { Spinner } from '@/shared/components/ui/Spinner'
import { ErrorState } from '@/shared/components/ErrorState'
import { messageForOr } from '@/shared/errors/apiErrors'
import { EVENTS, track } from '@/shared/analytics'
import { t } from '@/shared/i18n'
import { adminRecipesApi } from '../api/recipesApi'
import { useResource } from '../hooks/useResource'
import type { RecipeBundle, VersionInput } from '../types'
import { missingFields } from '../utils/recipeInput'
import { RecipeEditor } from './RecipeEditor'

interface AdminRecipeEditorProps {
    /** `null` — новый рецепт: первое сохранение его создаёт. */
    recipeId: string | null
}

const BACK_LINK =
    '-ml-2.5 inline-flex h-11 w-11 items-center justify-center rounded-full text-fg transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'

/** Экран команды: черновик рецепта, отправка на проверку, публикация. */
export function AdminRecipeEditor({ recipeId }: AdminRecipeEditorProps) {
    const router = useRouter()
    const load = useCallback(() => adminRecipesApi.get(recipeId as string), [recipeId])
    const { data: bundle, error, loading, reload } = useResource<RecipeBundle>(recipeId ? load : null)
    const [busy, setBusy] = useState<'save' | 'submit' | 'status' | null>(null)
    const [missing, setMissing] = useState<string[] | null>(null)

    /** Сохраняет черновик (или создаёт рецепт) и возвращает его id. */
    const persist = async (input: VersionInput): Promise<string> => {
        if (recipeId) {
            await adminRecipesApi.saveDraft(recipeId, input)
            return recipeId
        }
        const created = await adminRecipesApi.create(input)
        return created.recipe.id
    }

    const afterWrite = (id: string) => {
        if (id !== recipeId) router.replace(`/admin/recipes/${id}`)
        else reload()
    }

    const handleSave = async (input: VersionInput) => {
        setBusy('save')
        setMissing(null)
        try {
            const id = await persist(input)
            toast.success(t('recipes.admin.saved'))
            afterWrite(id)
        } catch (err) {
            setMissing(missingFields(err))
            toast.error(messageForOr(err, t('recipes.admin.saveFailed')))
        } finally {
            setBusy(null)
        }
    }

    const handleSubmit = async (input: VersionInput) => {
        setBusy('submit')
        setMissing(null)
        let id = recipeId
        try {
            id = await persist(input)
            await adminRecipesApi.submit(id)
            track(EVENTS.recipeSubmitted)
            toast.success(t('recipes.admin.submitted'))
            afterWrite(id)
        } catch (err) {
            setMissing(missingFields(err))
            toast.error(messageForOr(err, t('recipes.admin.submitFailed')))
            // Черновик мог успеть создаться до отказа в отправке — тогда
            // остаёмся на его адресе, а не на «Новом рецепте».
            if (id && id !== recipeId) router.replace(`/admin/recipes/${id}`)
        } finally {
            setBusy(null)
        }
    }

    const handlePublication = async () => {
        if (!recipeId || !bundle) return
        const publishing = bundle.recipe.status === 'unpublished'
        setBusy('status')
        try {
            if (publishing) await adminRecipesApi.publish(recipeId)
            else await adminRecipesApi.unpublish(recipeId)
            toast.success(publishing ? t('recipes.admin.published') : t('recipes.admin.unpublished'))
            reload()
        } catch (err) {
            toast.error(messageForOr(err, t('recipes.admin.statusFailed')))
        } finally {
            setBusy(null)
        }
    }

    const header = (title: string) => (
        <header className="flex flex-col items-start gap-2">
            <Link href="/admin/recipes" aria-label={t('recipes.admin.backToList')} className={BACK_LINK}>
                <ArrowLeft className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
            </Link>
            <h1 className="type-title-1 text-fg">{title}</h1>
        </header>
    )

    if (recipeId && loading && !bundle) {
        return (
            <div className="mx-auto w-full max-w-3xl px-screen-x py-5">
                <Spinner label={t('common.loading')} />
            </div>
        )
    }

    if (recipeId && (error || !bundle)) {
        return (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-screen-x py-5">
                {header(t('recipes.admin.editTitle'))}
                <ErrorState variant="inline" title={t('recipes.admin.loadFailed')} onRetry={reload} showHomeLink={false} />
            </div>
        )
    }

    const working = bundle?.working ?? null
    const editable = working ?? bundle?.approved ?? null
    const returned = working?.state === 'draft' && working.review_comment

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-screen-x py-5">
            {header(bundle ? editable?.name || t('recipes.admin.editTitle') : t('recipes.admin.newTitle'))}

            {bundle && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="rounded-full bg-subtle px-2.5 py-0.5 font-medium text-fg-muted">
                        {t(`recipes.states.${bundle.recipe.status}`)}
                    </span>
                    {editable && (
                        <span className="text-fg-muted">
                            {t('recipes.admin.versionState', {
                                version: editable.version,
                                state: t(`recipes.states.${editable.state}`),
                            })}
                        </span>
                    )}
                </div>
            )}

            {returned && (
                <div className="flex gap-3 rounded-card border border-line bg-warning-soft p-4 text-warning-fg" role="note">
                    <MessageSquareWarning className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                    <div>
                        <p className="font-semibold">{t('recipes.admin.returnedComment')}</p>
                        <p className="mt-1 whitespace-pre-line text-sm">{working.review_comment}</p>
                    </div>
                </div>
            )}

            {working?.state === 'review' && <p className="text-sm text-fg-muted">{t('recipes.admin.inReview')}</p>}

            <RecipeEditor
                key={editable?.id ?? 'new'}
                initial={editable}
                mode="admin"
                missing={missing}
                actions={(getInput) => (
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => handleSave(getInput())}
                            isLoading={busy === 'save'}
                            disabled={busy !== null}
                        >
                            {t('recipes.admin.save')}
                        </Button>
                        <Button
                            onClick={() => handleSubmit(getInput())}
                            isLoading={busy === 'submit'}
                            disabled={busy !== null}
                        >
                            {t('recipes.admin.submit')}
                        </Button>
                        {bundle && bundle.recipe.approved_version != null && (
                            <Button
                                variant="ghost"
                                onClick={handlePublication}
                                isLoading={busy === 'status'}
                                disabled={busy !== null}
                            >
                                {bundle.recipe.status === 'published'
                                    ? t('recipes.admin.unpublish')
                                    : t('recipes.admin.publish')}
                            </Button>
                        )}
                    </>
                )}
            />
        </div>
    )
}
