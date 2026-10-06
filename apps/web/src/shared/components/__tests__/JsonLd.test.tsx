import { render } from '@testing-library/react'
import { JsonLd } from '../JsonLd'

function scriptOf(container: HTMLElement): HTMLScriptElement {
    const script = container.querySelector('script[type="application/ld+json"]')
    if (!script) throw new Error('no JSON-LD script rendered')
    return script as HTMLScriptElement
}

describe('JsonLd', () => {
    // A title is typed into the article editor and lands here verbatim. Left
    // unescaped, "</script>" in it closes the block and whatever follows runs
    // as markup on every visitor's page.
    it('cannot be closed from inside the data', () => {
        const hostile = '</script><img src=x onerror=alert(1)>'
        const { container } = render(<JsonLd data={{ headline: hostile }} />)

        const raw = scriptOf(container).innerHTML
        expect(raw).not.toMatch(/<\/script/i)
        expect(raw).not.toContain('<img')
        expect(JSON.parse(raw)).toEqual({ headline: hostile })
    })

    it('escapes the characters that end a script line in older parsers', () => {
        const data = { text: 'a\u2028b\u2029c & d > e' }
        const { container } = render(<JsonLd data={data} />)

        const raw = scriptOf(container).innerHTML
        expect(raw).not.toContain('\u2028')
        expect(raw).not.toContain('\u2029')
        expect(raw).not.toContain('&')
        expect(raw).not.toContain('>')
        expect(JSON.parse(raw)).toEqual(data)
    })
})
