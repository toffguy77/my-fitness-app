/**
 * What a route segment shows while it is being fetched.
 *
 * Next renders this the moment a navigation starts, so the previous screen does
 * not sit there looking frozen. It is deliberately plain: a skeleton that
 * pretends to be the page it is not yet would be a lie that flickers.
 */
export function SegmentLoading({ label }: { label: string }) {
    return (
        <div
            className="flex min-h-screen items-center justify-center bg-gray-50"
            role="status"
            aria-live="polite"
        >
            <div className="text-center">
                <div
                    className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"
                    aria-hidden="true"
                />
                <p className="text-gray-600">{label}</p>
            </div>
        </div>
    )
}

SegmentLoading.displayName = 'SegmentLoading'
