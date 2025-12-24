/**
 * Unit Tests: Chat Sound
 * Tests notification sound utilities
 */

import {
  initNotificationSound,
  playNotificationSound,
} from '../chat/sound'

describe('Chat Sound', () => {
  const originalAudioContext = global.AudioContext
  const originalWebkitAudioContext = (global as any).webkitAudioContext

  beforeEach(() => {
    jest.clearAllMocks()
    delete (global as any).AudioContext
    delete (global as any).webkitAudioContext
  })

  afterEach(() => {
    global.AudioContext = originalAudioContext
    ;(global as any).webkitAudioContext = originalWebkitAudioContext
  })

  describe('initNotificationSound', () => {
    it('should do nothing when window is undefined', () => {
      const originalWindow = global.window
      delete (global.window as any)

      initNotificationSound()

      // Should not throw
      expect(true).toBe(true)
      global.window = originalWindow
    })

    it('should initialize sound when AudioContext is available', () => {
      const mockOscillator = {
        connect: jest.fn(),
        frequency: { value: 0 },
        type: '',
        start: jest.fn(),
        stop: jest.fn(),
      }

      const mockGain = {
        connect: jest.fn(),
        gain: {
          setValueAtTime: jest.fn(),
          exponentialRampToValueAtTime: jest.fn(),
        },
      }

      const mockAudioContext = {
        createOscillator: jest.fn(() => mockOscillator),
        createGain: jest.fn(() => mockGain),
        destination: {},
        currentTime: 0,
      }

      global.AudioContext = jest.fn().mockImplementation(() => mockAudioContext) as any

      initNotificationSound()

      expect(mockAudioContext.createOscillator).toHaveBeenCalled()
      expect(mockAudioContext.createGain).toHaveBeenCalled()
      expect(mockOscillator.connect).toHaveBeenCalled()
      expect(mockGain.connect).toHaveBeenCalled()
      expect(mockOscillator.start).toHaveBeenCalled()
      expect(mockOscillator.stop).toHaveBeenCalled()
    })

    it('should use webkitAudioContext as fallback', () => {
      const mockOscillator = {
        connect: jest.fn(),
        frequency: { value: 0 },
        type: '',
        start: jest.fn(),
        stop: jest.fn(),
      }

      const mockGain = {
        connect: jest.fn(),
        gain: {
          setValueAtTime: jest.fn(),
          exponentialRampToValueAtTime: jest.fn(),
        },
      }

      const mockAudioContext = {
        createOscillator: jest.fn(() => mockOscillator),
        createGain: jest.fn(() => mockGain),
        destination: {},
        currentTime: 0,
      }

      ;(global as any).webkitAudioContext = jest.fn().mockImplementation(() => mockAudioContext)

      initNotificationSound()

      expect(mockAudioContext.createOscillator).toHaveBeenCalled()
    })
  })

  describe('playNotificationSound', () => {
    it('should initialize and play sound when not initialized', () => {
      const mockOscillator = {
        connect: jest.fn(),
        frequency: { value: 0 },
        type: '',
        start: jest.fn(),
        stop: jest.fn(),
      }

      const mockGain = {
        connect: jest.fn(),
        gain: {
          setValueAtTime: jest.fn(),
          exponentialRampToValueAtTime: jest.fn(),
        },
      }

      const mockAudioContext = {
        createOscillator: jest.fn(() => mockOscillator),
        createGain: jest.fn(() => mockGain),
        destination: {},
        currentTime: 0,
      }

      global.AudioContext = jest.fn().mockImplementation(() => mockAudioContext) as any

      playNotificationSound()

      // Should create new AudioContext for playing
      expect(global.AudioContext).toHaveBeenCalled()
    })

    it('should handle errors gracefully', () => {
      const mockAudioContext = {
        createOscillator: jest.fn(() => {
          throw new Error('Audio error')
        }),
        createGain: jest.fn(),
        destination: {},
        currentTime: 0,
      }

      global.AudioContext = jest.fn().mockImplementation(() => mockAudioContext) as any

      // Should not throw
      expect(() => {
        playNotificationSound()
      }).not.toThrow()
    })

    it('should play sound when already initialized', () => {
      const mockOscillator = {
        connect: jest.fn(),
        frequency: { value: 0 },
        type: '',
        start: jest.fn(),
        stop: jest.fn(),
      }

      const mockGain = {
        connect: jest.fn(),
        gain: {
          setValueAtTime: jest.fn(),
          exponentialRampToValueAtTime: jest.fn(),
        },
      }

      const mockAudioContext = {
        createOscillator: jest.fn(() => mockOscillator),
        createGain: jest.fn(() => mockGain),
        destination: {},
        currentTime: 0,
      }

      global.AudioContext = jest.fn().mockImplementation(() => mockAudioContext) as any

      // Initialize first
      initNotificationSound()

      // Then play
      playNotificationSound()

      // Should create new AudioContext for playing
      expect(global.AudioContext).toHaveBeenCalled()
    })
  })
})

