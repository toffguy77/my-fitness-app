/**
 * Business Logic Tests for Coach Dashboard
 * Tests status calculation, filtering, and sorting logic
 */

describe('Coach Dashboard Business Logic', () => {
  describe('Status Calculation (Traffic Light System v2)', () => {
    const calculateStatus = (
      todayLog: any,
      target: any,
      lastCheckinDate: Date | null
    ): 'red' | 'green' | 'yellow' | 'grey' => {
      const now = new Date()
      const hoursSinceLastCheckin = lastCheckinDate
        ? (now.getTime() - lastCheckinDate.getTime()) / (1000 * 60 * 60)
        : null

      if (todayLog && target) {
        const isCompleted = todayLog.is_completed === true
        // Защита от деления на ноль
        const diff = target.calories > 0
          ? Math.abs((todayLog.actual_calories - target.calories) / target.calories)
          : todayLog.actual_calories > 0 ? 1 : 0

        if (isCompleted && diff <= 0.15) {
          return 'green'
        } else if (isCompleted && diff > 0.15) {
          return 'yellow'
        } else if (!isCompleted && diff > 0.15) {
          return 'red'
        } else if (!isCompleted) {
          return 'yellow'
        } else {
          return 'green'
        }
      } else if (!todayLog) {
        if (hoursSinceLastCheckin === null) {
          // Никогда не было чекина - нет данных
          return 'grey'
        } else if (hoursSinceLastCheckin > 48) {
          return 'red'
        } else if (hoursSinceLastCheckin > 24) {
          return 'yellow'
        } else {
          return 'grey'
        }
      } else {
        return 'grey'
      }
    }

    it('should return green for completed day within 15% of target', () => {
      const todayLog = {
        actual_calories: 2100,
        is_completed: true,
      }
      const target = { calories: 2000 }
      const lastCheckin = new Date(Date.now() - 12 * 60 * 60 * 1000) // 12 hours ago

      const status = calculateStatus(todayLog, target, lastCheckin)

      expect(status).toBe('green')
    })

    it('should return yellow for completed day with >15% deviation', () => {
      const todayLog = {
        actual_calories: 2400,
        is_completed: true,
      }
      const target = { calories: 2000 }
      const lastCheckin = new Date(Date.now() - 12 * 60 * 60 * 1000)

      const status = calculateStatus(todayLog, target, lastCheckin)

      expect(status).toBe('yellow')
    })

    it('should return red for incomplete day with >15% deviation', () => {
      const todayLog = {
        actual_calories: 2400,
        is_completed: false,
      }
      const target = { calories: 2000 }
      const lastCheckin = new Date(Date.now() - 12 * 60 * 60 * 1000)

      const status = calculateStatus(todayLog, target, lastCheckin)

      expect(status).toBe('red')
    })

    it('should return yellow for incomplete day within 15% of target', () => {
      const todayLog = {
        actual_calories: 2100,
        is_completed: false,
      }
      const target = { calories: 2000 }
      const lastCheckin = new Date(Date.now() - 12 * 60 * 60 * 1000)

      const status = calculateStatus(todayLog, target, lastCheckin)

      expect(status).toBe('yellow')
    })

    it('should return red when no log and last checkin > 48 hours ago', () => {
      const todayLog = null
      const target = { calories: 2000 }
      const lastCheckin = new Date(Date.now() - 50 * 60 * 60 * 1000) // 50 hours ago

      const status = calculateStatus(todayLog, target, lastCheckin)

      expect(status).toBe('red')
    })

    it('should return yellow when no log and last checkin 24-48 hours ago', () => {
      const todayLog = null
      const target = { calories: 2000 }
      const lastCheckin = new Date(Date.now() - 30 * 60 * 60 * 1000) // 30 hours ago

      const status = calculateStatus(todayLog, target, lastCheckin)

      expect(status).toBe('yellow')
    })

    it('should return grey when no log and no last checkin', () => {
      const todayLog = null
      const target = { calories: 2000 }
      const lastCheckin = null

      const status = calculateStatus(todayLog, target, lastCheckin)

      expect(status).toBe('grey')
    })

    it('should handle edge case: exactly 15% deviation (completed)', () => {
      const todayLog = {
        actual_calories: 2300, // Exactly 15% above 2000
        is_completed: true,
      }
      const target = { calories: 2000 }
      const lastCheckin = new Date(Date.now() - 12 * 60 * 60 * 1000)

      const status = calculateStatus(todayLog, target, lastCheckin)

      // Should be green (diff <= 0.15)
      expect(status).toBe('green')
    })

    it('should handle edge case: just over 15% deviation (completed)', () => {
      const todayLog = {
        actual_calories: 2301, // Just over 15% above 2000
        is_completed: true,
      }
      const target = { calories: 2000 }
      const lastCheckin = new Date(Date.now() - 12 * 60 * 60 * 1000)

      const status = calculateStatus(todayLog, target, lastCheckin)

      expect(status).toBe('yellow')
    })

    it('should handle zero target calories without division by zero', () => {
      const todayLog = {
        actual_calories: 2000,
        is_completed: false,
      }
      const target = { calories: 0 }
      const lastCheckin = new Date(Date.now() - 12 * 60 * 60 * 1000)

      const status = calculateStatus(todayLog, target, lastCheckin)

      // Should not throw error, should return yellow (diff = 1, which is > 0.15)
      expect(status).toBe('red')
    })
  })

  describe('Status Sorting', () => {
    it('should sort by status priority: red > yellow > grey > green', () => {
      const statusOrder = { red: 1, yellow: 2, grey: 3, green: 4 }

      const clients = [
        { id: '1', todayStatus: 'green' as const },
        { id: '2', todayStatus: 'red' as const },
        { id: '3', todayStatus: 'yellow' as const },
        { id: '4', todayStatus: 'grey' as const },
      ]

      const sorted = [...clients].sort(
        (a, b) =>
          (statusOrder[a.todayStatus!] || 0) -
          (statusOrder[b.todayStatus!] || 0)
      )

      expect(sorted[0].todayStatus).toBe('red')
      expect(sorted[1].todayStatus).toBe('yellow')
      expect(sorted[2].todayStatus).toBe('grey')
      expect(sorted[3].todayStatus).toBe('green')
    })
  })

  describe('Status Filtering', () => {
    it('should filter clients by status correctly', () => {
      const clients = [
        { id: '1', todayStatus: 'red' as const },
        { id: '2', todayStatus: 'green' as const },
        { id: '3', todayStatus: 'red' as const },
        { id: '4', todayStatus: 'yellow' as const },
      ]

      const filtered = clients.filter((c) => c.todayStatus === 'red')

      expect(filtered).toHaveLength(2)
      expect(filtered.every((c) => c.todayStatus === 'red')).toBe(true)
    })

    it('should return all clients when filter is "all"', () => {
      const clients = [
        { id: '1', todayStatus: 'red' as const },
        { id: '2', todayStatus: 'green' as const },
        { id: '3', todayStatus: 'yellow' as const },
      ]

      const statusFilter: 'all' | 'red' | 'green' | 'yellow' | 'grey' = 'all'
      const filtered =
        statusFilter === 'all'
          ? clients
          : clients.filter((c) => c.todayStatus === statusFilter)

      expect(filtered).toHaveLength(3)
    })
  })

  describe('Calories Deviation Calculation', () => {
    it('should calculate deviation percentage correctly', () => {
      const actual = 2100
      const target = 2000
      const diff = target > 0 ? Math.abs((actual - target) / target) : 0

      expect(diff).toBe(0.05) // 5%
    })

    it('should handle zero target calories', () => {
      const actual = 2000
      const target = 0

      const diff = target > 0
        ? Math.abs((actual - target) / target)
        : actual > 0 ? 1 : 0

      expect(diff).toBe(1) // 100% deviation when target is 0
    })

    it('should calculate absolute deviation correctly', () => {
      const actual = 1900
      const target = 2000
      const diff = target > 0 ? Math.abs((actual - target) / target) : 0

      expect(diff).toBe(0.05) // 5% (absolute value)
    })
  })
})
