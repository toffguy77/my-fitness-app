import { parseArticleMarkdown } from '../parseFrontmatter'

describe('parseArticleMarkdown', () => {
    it('parses frontmatter and extracts title from H1', () => {
        const md = `---
category: nutrition
excerpt: Short description
cover: https://example.com/img.jpg
audience: all
---

# My Article Title

Body content here.`

        const result = parseArticleMarkdown(md)

        expect(result.title).toBe('My Article Title')
        expect(result.category).toBe('nutrition')
        expect(result.excerpt).toBe('Short description')
        expect(result.coverUrl).toBe('https://example.com/img.jpg')
        expect(result.audience).toBe('all')
        expect(result.body).toBe('Body content here.')
    })

    it('handles missing frontmatter', () => {
        const md = `# Just a Title

Some body text.`

        const result = parseArticleMarkdown(md)

        expect(result.title).toBe('Just a Title')
        expect(result.category).toBeUndefined()
        expect(result.excerpt).toBeUndefined()
        expect(result.coverUrl).toBeUndefined()
        expect(result.body).toBe('Some body text.')
    })

    it('handles frontmatter without H1 title', () => {
        const md = `---
category: health
---

Body without title heading.`

        const result = parseArticleMarkdown(md)

        expect(result.title).toBeUndefined()
        expect(result.category).toBe('health')
        expect(result.body).toBe('Body without title heading.')
    })

    it('validates category against allowed values', () => {
        const md = `---
category: invalid_cat
---

# Title

Body.`

        const result = parseArticleMarkdown(md)

        expect(result.category).toBeUndefined()
    })

    it('validates audience against allowed values', () => {
        const md = `---
audience: everyone
---

# Title

Body.`

        const result = parseArticleMarkdown(md)

        expect(result.audience).toBeUndefined()
    })

    it('handles old quote-style format gracefully', () => {
        const md = `# Title

> **Категория:** Питание
> **Краткое описание:** Desc

---

Body.`

        const result = parseArticleMarkdown(md)

        expect(result.title).toBe('Title')
        expect(result.category).toBeUndefined()
    })

    it('preserves body with multiple sections', () => {
        const md = `---
category: general
---

# Title

## Section 1

Text 1

## Section 2

Text 2`

        const result = parseArticleMarkdown(md)

        expect(result.body).toContain('## Section 1')
        expect(result.body).toContain('## Section 2')
        expect(result.body).toContain('Text 1')
        expect(result.body).toContain('Text 2')
    })
})
