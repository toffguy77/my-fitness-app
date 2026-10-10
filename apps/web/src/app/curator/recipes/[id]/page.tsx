'use client'

import { useParams } from 'next/navigation'
import { CuratorRecipeReview } from '@/features/recipes'

export default function CuratorRecipePage() {
    const params = useParams<{ id: string }>()
    return <CuratorRecipeReview recipeId={params.id} />
}
