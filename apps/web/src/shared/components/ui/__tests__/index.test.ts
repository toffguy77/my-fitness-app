import * as exports from '../index'

describe('UI components index', () => {
    it('exports Button', () => {
        expect(exports.Button).toBeDefined()
    })

    it('exports Input', () => {
        expect(exports.Input).toBeDefined()
    })

    it('exports Card components', () => {
        expect(exports.Card).toBeDefined()
        expect(exports.CardHeader).toBeDefined()
        expect(exports.CardTitle).toBeDefined()
        expect(exports.CardDescription).toBeDefined()
        expect(exports.CardContent).toBeDefined()
        expect(exports.CardFooter).toBeDefined()
    })
})
