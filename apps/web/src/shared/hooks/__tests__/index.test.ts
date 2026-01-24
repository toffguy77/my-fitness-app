import * as exports from '../index'

describe('Hooks index', () => {
    it('exports useAuth', () => {
        expect(exports.useAuth).toBeDefined()
    })

    it('exports useLogger', () => {
        expect(exports.useLogger).toBeDefined()
    })
})
