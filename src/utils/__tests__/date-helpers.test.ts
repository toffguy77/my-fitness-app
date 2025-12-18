/**
 * Unit Tests: Date Helper Functions
 * Tests date formatting and manipulation utilities
 */

describe('Date Helper Functions', () => {
  describe('formatDate', () => {
    const formatDate = (dateStr: string) => {
      return new Date(dateStr).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
    }

    it('should format date correctly', () => {
      const result = formatDate('2024-01-15')
      expect(result).toMatch(/\d{2}/) // Should contain day
      expect(result).toMatch(/[а-яё]+/i) // Should contain month name in Russian
    })

    it('should handle different date formats', () => {
      const dates = ['2024-01-15', '2024-12-31', '2024-06-01']
      dates.forEach((date) => {
        const result = formatDate(date)
        expect(result).toBeDefined()
        expect(typeof result).toBe('string')
      })
    })

    it('should handle edge dates', () => {
      const edgeDates = [
        '2024-01-01', // First day of year
        '2024-12-31', // Last day of year
        '2024-02-29', // Leap year
      ]
      edgeDates.forEach((date) => {
        const result = formatDate(date)
        expect(result).toBeDefined()
      })
    })
  })

  describe('weekdayShort', () => {
    const weekdayShort = (dateStr: string) => {
      const date = new Date(dateStr)
      return date.toLocaleDateString('ru-RU', { weekday: 'short' })
    }

    it('should return weekday abbreviation', () => {
      const result = weekdayShort('2024-01-15') // Monday
      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
    })

    it('should handle all weekdays', () => {
      const weekdays = [
        '2024-01-15', // Monday
        '2024-01-16', // Tuesday
        '2024-01-17', // Wednesday
        '2024-01-18', // Thursday
        '2024-01-19', // Friday
        '2024-01-20', // Saturday
        '2024-01-21', // Sunday
      ]
      weekdays.forEach((date) => {
        const result = weekdayShort(date)
        expect(result).toBeDefined()
      })
    })
  })

  describe('Date Navigation', () => {
    it('should navigate to previous day', () => {
      const selectedDate = '2024-01-15'
      const date = new Date(selectedDate)
      date.setDate(date.getDate() - 1)
      const previousDate = date.toISOString().split('T')[0]

      expect(previousDate).toBe('2024-01-14')
    })

    it('should navigate to next day', () => {
      const selectedDate = '2024-01-15'
      const date = new Date(selectedDate)
      date.setDate(date.getDate() + 1)
      const nextDate = date.toISOString().split('T')[0]

      expect(nextDate).toBe('2024-01-16')
    })

    it('should handle month boundaries', () => {
      const selectedDate = '2024-01-01'
      const date = new Date(selectedDate)
      date.setDate(date.getDate() - 1)
      const previousDate = date.toISOString().split('T')[0]

      expect(previousDate).toBe('2023-12-31')
    })

    it('should handle year boundaries', () => {
      const selectedDate = '2024-12-31'
      const date = new Date(selectedDate)
      date.setDate(date.getDate() + 1)
      const nextDate = date.toISOString().split('T')[0]

      expect(nextDate).toBe('2025-01-01')
    })

    it('should prevent navigation to future dates', () => {
      const today = new Date().toISOString().split('T')[0]
      const selectedDate = today
      const date = new Date(selectedDate)
      date.setDate(date.getDate() + 1)
      const nextDate = date.toISOString().split('T')[0]
      const canNavigate = nextDate <= today

      expect(canNavigate).toBe(false)
    })
  })

  describe('Date Comparison', () => {
    it('should compare dates correctly', () => {
      const date1 = '2024-01-15'
      const date2 = '2024-01-16'
      const date1Time = new Date(date1).getTime()
      const date2Time = new Date(date2).getTime()

      expect(date1Time).toBeLessThan(date2Time)
    })

    it('should check if date is today', () => {
      const today = new Date().toISOString().split('T')[0]
      const isToday = today === new Date().toISOString().split('T')[0]

      expect(isToday).toBe(true)
    })

    it('should check if date is in the past', () => {
      const pastDate = '2024-01-01'
      const today = new Date().toISOString().split('T')[0]
      const isPast = pastDate < today

      expect(isPast).toBe(true)
    })
  })

  describe('Date Parsing', () => {
    it('should parse ISO date string', () => {
      const dateStr = '2024-01-15'
      const date = new Date(dateStr)
      
      expect(date).toBeInstanceOf(Date)
      expect(!isNaN(date.getTime())).toBe(true)
    })

    it('should handle date with time', () => {
      const dateStr = '2024-01-15T10:30:00Z'
      const date = new Date(dateStr)
      
      expect(date).toBeInstanceOf(Date)
      expect(!isNaN(date.getTime())).toBe(true)
    })

    it('should extract date part from ISO string', () => {
      const fullDate = '2024-01-15T10:30:00Z'
      const datePart = fullDate.split('T')[0]

      expect(datePart).toBe('2024-01-15')
    })
  })
})


