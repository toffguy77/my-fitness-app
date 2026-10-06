interface JsonLdProps {
    data: Record<string, unknown>
}

/**
 * The characters that let data end the script element it sits in, or end a
 * line inside it for older parsers. Replaced with JSON escapes, the output is
 * still the same JSON — a parser reads back exactly the data that went in.
 */
const UNSAFE_IN_SCRIPT: Record<string, string> = {
    '<': '\\u003c',
    '>': '\\u003e',
    '&': '\\u0026',
    '\u2028': '\\u2028',
    '\u2029': '\\u2029',
}

/**
 * Serialises structured data for a `<script>` block.
 *
 * Plain `JSON.stringify` is not enough: an article title is typed into the
 * editor and lands here verbatim, and "</script>" inside it would close the
 * block and put whatever follows onto the page as markup.
 */
export function serializeJsonLd(data: Record<string, unknown>): string {
    return JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (ch) => UNSAFE_IN_SCRIPT[ch])
}

export function JsonLd({ data }: JsonLdProps) {
    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
        />
    )
}
