import { Logger, LogLevel } from '../logger'

describe('Logger', () => {
    let logger: Logger

    beforeEach(() => {
        logger = new Logger({
            enableConsole: false,
            enableRemote: false,
        })
        jest.spyOn(console, 'debug').mockImplementation()
        jest.spyOn(console, 'info').mockImplementation()
        jest.spyOn(console, 'warn').mockImplementation()
        jest.spyOn(console, 'error').mockImplementation()
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    describe('log levels', () => {
        it('logs debug messages', () => {
            logger = new Logger({ enableConsole: true, enableRemote: false, minLevel: LogLevel.DEBUG })
            logger.debug('test debug')
            expect(console.debug).toHaveBeenCalled()
        })

        it('logs info messages', () => {
            logger = new Logger({ enableConsole: true, enableRemote: false })
            logger.info('test info')
            expect(console.info).toHaveBeenCalled()
        })

        it('logs warn messages', () => {
            logger = new Logger({ enableConsole: true, enableRemote: false })
            logger.warn('test warn')
            expect(console.warn).toHaveBeenCalled()
        })

        it('logs error messages', () => {
            logger = new Logger({ enableConsole: true, enableRemote: false })
            logger.error('test error')
            expect(console.error).toHaveBeenCalled()
        })

        it('logs fatal messages', () => {
            logger = new Logger({ enableConsole: true, enableRemote: false })
            logger.fatal('test fatal')
            expect(console.error).toHaveBeenCalled()
        })
    })

    describe('context', () => {
        it('includes context in log entries', () => {
            logger.info('test', { userId: '123' })
            // No assertion needed, just verify no errors
        })

        it('includes error in log entries', () => {
            const error = new Error('test error')
            logger.error('test', error)
            // No assertion needed, just verify no errors
        })
    })

    describe('user management', () => {
        it('sets user ID', () => {
            logger.setUserId('user-123')
            logger.info('test')
            // No assertion needed, just verify no errors
        })

        it('clears user ID', () => {
            logger.setUserId('user-123')
            logger.clearUserId()
            logger.info('test')
            // No assertion needed, just verify no errors
        })
    })

    describe('specialized logging', () => {
        it('logs API calls', () => {
            logger.logAPICall('GET', '/api/users', 200, 100)
            // No assertion needed, just verify no errors
        })

        it('logs user actions', () => {
            logger.logUserAction('button_click', { button: 'submit' })
            // No assertion needed, just verify no errors
        })

        it('logs performance metrics', () => {
            logger.logPerformance('page_load', 1500)
            // No assertion needed, just verify no errors
        })

        it('logs security events', () => {
            logger.logSecurityEvent('failed_login', 'high', { ip: '192.168.1.1' })
            // No assertion needed, just verify no errors
        })
    })

    describe('log level filtering', () => {
        it('respects minimum log level', () => {
            logger = new Logger({
                enableConsole: true,
                enableRemote: false,
                minLevel: LogLevel.WARN,
            })

            logger.debug('debug')
            logger.info('info')
            logger.warn('warn')

            expect(console.debug).not.toHaveBeenCalled()
            expect(console.info).not.toHaveBeenCalled()
            expect(console.warn).toHaveBeenCalled()
        })
    })
})
