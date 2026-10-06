import { metadata } from '../layout'

// The link in a digest carries a token. If anybody publishes it, an indexed
// copy would let a stranger unsubscribe its owner — and the page says nothing
// worth finding anyway.
describe('the unsubscribe page metadata', () => {
    it('keeps the page out of search', () => {
        expect(metadata.robots).toEqual({ index: false, follow: false })
    })
})
