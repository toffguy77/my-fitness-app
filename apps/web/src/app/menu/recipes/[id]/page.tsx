'use client'

import { useParams } from 'next/navigation'
import { RecipeDetail } from '@/features/recipes'

export default function MenuRecipePage() {
    const params = useParams<{ id: string }>()
    return <RecipeDetail id={params.id} />
}
