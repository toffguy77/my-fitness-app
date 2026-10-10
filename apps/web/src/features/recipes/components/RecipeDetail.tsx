'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/shared/components/ui/Button'
import { Spinner } from '@/shared/components/ui/Spinner'
import { ErrorState } from '@/shared/components/ErrorState'
import { isApiError, messageForOr } from '@/shared/errors/apiErrors'
import { EVENTS, track } from '@/shared/analytics'
import { t } from '@/shared/i18n'
import { recipesApi } from '../api/recipesApi'
import { useResource } from '../hooks/useResource'
import { RecipeView } from './RecipeView'

interface RecipeDetailProps {
    id: string
}

/** Карточка рецепта в «Меню» клиента с кнопкой «Не предлагать это блюдо». */
export function RecipeDetail({ id }: RecipeDetailProps) {
    const router = useRouter()
    const [rejecting, setRejecting] = useState(false)
    const load = useCallback(() => recipesApi.get(id), [id])
    const { data: version, error, loading, reload } = useResource(load)

    useEffect(() => {
        track(EVENTS.recipeOpened)
    }, [id])

    const handleReject = async () => {
        setRejecting(true)
        try {
            await recipesApi.reject(id)
            track(EVENTS.recipeRejected)
            toast.success(t('recipes.detail.rejected'))
            router.push('/menu')
        } catch (err) {
            toast.error(messageForOr(err, t('recipes.detail.rejectFailed')))
            setRejecting(false)
        }
    }

    const notFound = isApiError(error) && error.status === 404

    return (
        <div className="mx-auto flex w-full max-w-content flex-col gap-4 px-screen-x py-5">
            <Link
                href="/menu"
                aria-label={t('recipes.detail.back')}
                className="-ml-2.5 inline-flex h-11 w-11 items-center justify-center rounded-full text-fg transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
                <ArrowLeft className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
            </Link>

            {loading && !version ? (
                <Spinner label={t('recipes.detail.loading')} />
            ) : notFound ? (
                <ErrorState
                    variant="inline"
                    title={t('recipes.detail.notFound')}
                    description={t('recipes.detail.notFoundText')}
                    showHomeLink={false}
                />
            ) : error || !version ? (
                <ErrorState variant="inline" title={t('recipes.detail.loadFailed')} onRetry={reload} showHomeLink={false} />
            ) : (
                <>
                    <RecipeView version={version} />
                    <Button variant="ghost" block onClick={handleReject} isLoading={rejecting} className="mt-2">
                        <EyeOff className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                        {t('recipes.detail.reject')}
                    </Button>
                </>
            )}
        </div>
    )
}
