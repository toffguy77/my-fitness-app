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
            className="flex min-h-screen items-center justify-center bg-canvas px-screen-x"
            role="status"
            aria-live="polite"
        >
            <div className="flex flex-col items-center gap-4 text-center">
                <div
                    className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-primary"
                    aria-hidden="true"
                />
                <p className="text-sm text-fg-muted">{label}</p>
            </div>
        </div>
    )
}

SegmentLoading.displayName = 'SegmentLoading'
