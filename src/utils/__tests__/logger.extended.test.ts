/**
 * Extended Logger Tests
 * Tests additional logger functionality and edge cases
 */

// Unmock logger for these tests to use real implementation
jest.unmock('@/utils/logger')
import { logger, Logger, LogLevel } from '../logger'

describe('Logger Extended Tests', () => {
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

  describe('Log Level Management', () => {
    it('should get current log level', () => {
      const customLogger = new Logger()
      customLogger.setLevel(LogLevel.WARN)
      
      expect(customLogger.getLevel()).toBe(LogLevel.WARN)
    })

    it('should set log level programmatically', () => {
      const customLogger = new Logger()
      customLogger.setLevel(LogLevel.ERROR)
      
      expect(customLogger.getLevel()).toBe(LogLevel.ERROR)
    })

    it('should respect NONE log level', () => {
      const customLogger = new Logger()
      customLogger.setLevel(LogLevel.NONE)
      
      customLogger.debug('Should not log')
      customLogger.info('Should not log')
      customLogger.warn('Should not log')
      customLogger.error('Should not log')
      
      expect(consoleSpy.debug).not.toHaveBeenCalled()
      expect(consoleSpy.info).not.toHaveBeenCalled()
      expect(consoleSpy.warn).not.toHaveBeenCalled()
      expect(consoleSpy.error).not.toHaveBeenCalled()
    })
  })

  describe('Context Handling', () => {
    it('should handle complex context objects', () => {
      const complexContext = {
        userId: '123',
        action: 'save',
        metadata: {
          timestamp: new Date().toISOString(),
          version: '1.0',
        },
        array: [1, 2, 3],
      }
      
      logger.info('Test message', complexContext)
      
      expect(consoleSpy.info).toHaveBeenCalled()
      const callArgs = consoleSpy.info.mock.calls[0][0]
      expect(callArgs).toContain('userId')
      expect(callArgs).toContain('action')
    })

    it('should handle null context', () => {
      logger.info('Test message', null as any)
      
      expect(consoleSpy.info).toHaveBeenCalled()
    })

    it('should handle undefined context', () => {
      logger.info('Test message', undefined)
      
      expect(consoleSpy.info).toHaveBeenCalled()
    })

    it('should handle empty object context', () => {
      logger.info('Test message', {})
      
      expect(consoleSpy.info).toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle Error objects', () => {
      const error = new Error('Test error')
      logger.error('Test message', error)
      
      expect(consoleSpy.error).toHaveBeenCalled()
    })

    it('should handle string errors', () => {
      logger.error('Test message', 'String error')
      
      expect(consoleSpy.error).toHaveBeenCalled()
    })

    it('should handle number errors', () => {
      logger.error('Test message', 404)
      
      expect(consoleSpy.error).toHaveBeenCalled()
    })

    it('should handle null errors', () => {
      logger.error('Test message', null)
      
      expect(consoleSpy.error).toHaveBeenCalled()
    })

    it('should handle undefined errors', () => {
      logger.error('Test message', undefined)
      
      expect(consoleSpy.error).toHaveBeenCalled()
    })

    it('should handle error with context', () => {
      const error = new Error('Test error')
      logger.error('Test message', error, { userId: '123' })
      
      expect(consoleSpy.error).toHaveBeenCalled()
    })
  })

  describe('Message Formatting', () => {
    it('should format messages with timestamp', () => {
      logger.info('Test message')
      
      const callArgs = consoleSpy.info.mock.calls[0][0]
      expect(callArgs).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    it('should format messages with log level', () => {
      logger.info('Test message')
      
      const callArgs = consoleSpy.info.mock.calls[0][0]
      expect(callArgs).toContain('[INFO]')
    })

    it('should include context in formatted message', () => {
      logger.info('Test message', { key: 'value' })
      
      const callArgs = consoleSpy.info.mock.calls[0][0]
      expect(callArgs).toContain('key')
      expect(callArgs).toContain('value')
    })
  })

  describe('Child Logger', () => {
    it('should create child logger with context', () => {
      const childLogger = logger.child({ module: 'test' })
      
      expect(childLogger).toBeInstanceOf(Logger)
    })

    it('should merge child context with log context', () => {
      const childLogger = logger.child({ userId: '123' })
      childLogger.info('Test message', { action: 'test' })
      
      const callArgs = consoleSpy.info.mock.calls[0][0]
      expect(callArgs).toContain('userId')
      expect(callArgs).toContain('action')
    })

    it('should override parent context with log context', () => {
      const childLogger = logger.child({ userId: '123' })
      childLogger.info('Test message', { userId: '456' })
      
      const callArgs = consoleSpy.info.mock.calls[0][0]
      // Should use '456' from log context, not '123' from child context
      expect(callArgs).toContain('456')
    })
  })

  describe('Log Level Filtering', () => {
    it('should filter debug messages when level is INFO', () => {
      const customLogger = new Logger()
      customLogger.setLevel(LogLevel.INFO)
      
      customLogger.debug('Should not log')
      
      expect(consoleSpy.debug).not.toHaveBeenCalled()
    })

    it('should filter info messages when level is WARN', () => {
      const customLogger = new Logger()
      customLogger.setLevel(LogLevel.WARN)
      
      customLogger.info('Should not log')
      
      expect(consoleSpy.info).not.toHaveBeenCalled()
    })

    it('should filter warn messages when level is ERROR', () => {
      const customLogger = new Logger()
      customLogger.setLevel(LogLevel.ERROR)
      
      customLogger.warn('Should not log')
      
      expect(consoleSpy.warn).not.toHaveBeenCalled()
    })
  })
})

