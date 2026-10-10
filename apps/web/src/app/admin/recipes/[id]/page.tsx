'use client'

import { useParams } from 'next/navigation'
import { AdminRecipeEditor } from '@/features/recipes'

export default function AdminRecipePage() {
    const params = useParams<{ id: string }>()
    return <AdminRecipeEditor recipeId={params.id} />
}
