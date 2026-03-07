import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    const secret = req.headers.get('x-revalidate-secret')
    if (!process.env.REVALIDATE_SECRET || secret !== process.env.REVALIDATE_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const path = body?.path as string | undefined

    if (!path) {
        return NextResponse.json({ error: 'Missing path' }, { status: 400 })
    }

    revalidatePath(path)

    return NextResponse.json({ revalidated: true, path })
}
