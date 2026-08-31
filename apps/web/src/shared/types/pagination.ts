/**
 * Response shape for a paginated collection.
 *
 * `total` is what lets a caller know more exists without probing with an extra
 * request.
 */
export interface Page<T> {
    items: T[]
    total: number
    limit: number
    offset: number
}

export interface PageRequest {
    limit?: number
    offset?: number
}

/** Renders a page request as a query string fragment. */
export function pageQuery(page?: PageRequest): string {
    if (!page) return ''
    const params = new URLSearchParams()
    if (page.limit !== undefined) params.set('limit', String(page.limit))
    if (page.offset !== undefined) params.set('offset', String(page.offset))
    const query = params.toString()
    return query ? `?${query}` : ''
}
