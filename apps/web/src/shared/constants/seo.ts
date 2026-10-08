/**
 * The picture a shared link shows, drawn by app/opengraph-image.tsx.
 *
 * Next applies that file to the home page only. A page that declares its own
 * `openGraph` replaces the parent's block whole, images included, so every
 * public page names this one explicitly — otherwise /pricing, /content and the
 * calculator went out to Telegram and VK without a picture, and the pages that
 * inherited the layout's block pointed at /og-image.png, which never existed.
 */
export const SHARE_IMAGE = {
    url: '/opengraph-image',
    width: 1200,
    height: 630,
    alt: 'BURCEV — Фитнес и питание',
} as const
