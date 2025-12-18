import { logger, Logger, LogLevel } from '../logger'

describe('Logger', () => {
  let consoleSpy: {
    debug: jest.SpyInstance
    info: jest.SpyInstance
    warn: jest.SpyInstance
    error: jest.SpyInstance
  }

  beforeEach(() => {
    consoleSpy = {
      debug: jest.spyOn(console, 'debug').mockImplementation(),
      info: jest.spyOn(console, 'info').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
    }
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('Log Levels', () => {
    it('should log debug messages in development', () => {
      // Set log level to DEBUG to ensure debug messages are logged
      logger.setLevel(LogLevel.DEBUG)
      logger.debug('Test debug message', { key: 'value' })
      expect(consoleSpy.debug).toHaveBeenCalled()
    })

    it('should log info messages', () => {
      logger.info('Test info message', { key: 'value' })
      expect(consoleSpy.info).toHaveBeenCalled()
    })

    it('should log warn messages', () => {
      logger.warn('Test warn message', { key: 'value' })
      expect(consoleSpy.warn).toHaveBeenCalled()
    })

    it('should log error messages with error object', () => {
      const error = new Error('Test error')
      logger.error('Test error message', error, { key: 'value' })
      expect(consoleSpy.error).toHaveBeenCalled()
    })

    it('should handle non-Error objects in error method', () => {
      logger.error('Test error message', 'string error', { key: 'value' })
      expect(consoleSpy.error).toHaveBeenCalled()
    })
  })

  describe('Log Level Filtering', () => {
    it('should respect log level settings', () => {
      const customLogger = new Logger()
      customLogger.setLevel(LogLevel.ERROR)
      
      customLogger.debug('Should not log')
      customLogger.info('Should not log')
      customLogger.warn('Should not log')
      customLogger.error('Should log')
      
      expect(consoleSpy.debug).not.toHaveBeenCalled()
      expect(consoleSpy.info).not.toHaveBeenCalled()
      expect(consoleSpy.warn).not.toHaveBeenCalled()
      expect(consoleSpy.error).toHaveBeenCalled()
    })
  })

  describe('Child Logger', () => {
    it('should merge context from child logger', () => {
      const childLogger = logger.child({ userId: '123' })
      childLogger.info('Test message', { action: 'test' })
      
      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('userId'),
      )
    })
  })

  describe('Context Logging', () => {
    it('should include context in log messages', () => {
      logger.info('Test message', { userId: '123', action: 'test' })
      
      const callArgs = consoleSpy.info.mock.calls[0][0]
      expect(callArgs).toContain('userId')
      expect(callArgs).toContain('action')
    })

    it('should handle empty context', () => {
      logger.info('Test message')
      expect(consoleSpy.info).toHaveBeenCalled()
    })
  })
})

