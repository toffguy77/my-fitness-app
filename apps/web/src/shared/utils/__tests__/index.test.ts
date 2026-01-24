import * as exports from '../index'

describe('Utils index', () => {
    it('exports cn', () => {
        expect(exports.cn).toBeDefined()
    })

    it('exports format functions', () => {
        expect(exports.formatDate).toBeDefined()
        expect(exports.formatNumber).toBeDefined()
        expect(exports.formatCurrency).toBeDefined()
        expect(exports.formatPercentage).toBeDefined()
    })

    it('exports validation functions', () => {
        expect(exports.validateEmail).toBeDefined()
        expect(exports.validatePassword).toBeDefined()
    })

    it('exports logger', () => {
        expect(exports.logger).toBeDefined()
        expect(exports.Logger).toBeDefined()
        expect(exports.LogLevel).toBeDefined()
    })
})
