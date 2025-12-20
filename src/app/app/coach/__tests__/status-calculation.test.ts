/**
 * Business Logic Tests: Coach Status Calculation (Traffic Light System v2)
 * Tests client status calculation logic
 */

describe('Coach Status Calculation (Traffic Light System v2)', () => {
  const calculateClientStatus = (
    todayLog: any,
    target: any,
    lastLog: any,
    hoursSinceLastCheckin: number | null
  ): 'red' | 'green' | 'yellow' | 'grey' => {
    let status: 'red' | 'green' | 'yellow' | 'grey' = 'grey'

    if (todayLog && target) {
      // Есть данные за сегодня
      const isCompleted = todayLog.is_completed === true
      const diff = target.calories > 0
        ? Math.abs((todayLog.actual_calories - target.calories) / target.calories)
        : todayLog.actual_calories > 0 ? 1 : 0

      if (isCompleted && diff <= 0.15) {
        // День закрыт, попадание в цели
        status = 'green'
      } else if (isCompleted && diff > 0.15) {
        // День закрыт, но отклонение > 15%
        status = 'yellow'
      } else if (!isCompleted && diff > 0.15) {
        // День не закрыт, отклонение > 15%
        status = 'red'
      } else if (!isCompleted) {
        // День не закрыт, но в пределах нормы
        status = 'yellow'
      } else {
        status = 'green'
      }
    } else if (!todayLog) {
      // Нет отчета за сегодня
      if (hoursSinceLastCheckin === null) {
        // Никогда не было чекина - нет данных
        status = 'grey'
      } else if (hoursSinceLastCheckin > 48) {
        // Нет отчета > 48 часов
        status = 'red'
      } else if (hoursSinceLastCheckin > 24) {
        // Нет отчета > 24 часов
        status = 'yellow'
      } else {
        // Нет данных, но недавно был чекин
        status = 'grey'
      }
    } else {
      // Нет данных вообще
      status = 'grey'
    }

    return status
  }

  describe('Status with Today Log', () => {
    it('should return green for completed day within 15% of target', () => {
      const todayLog = {
        actual_calories: 2000,
        is_completed: true,
      }
      const target = { calories: 2000 }
      const lastLog = { date: '2024-01-15' }
      const hoursSinceLastCheckin = 12

      const status = calculateClientStatus(todayLog, target, lastLog, hoursSinceLastCheckin)
      expect(status).toBe('green')
    })

    it('should return green for completed day with 10% deviation', () => {
      const todayLog = {
        actual_calories: 1800,
        is_completed: true,
      }
      const target = { calories: 2000 }
      const lastLog = { date: '2024-01-15' }
      const hoursSinceLastCheckin = 12

      const status = calculateClientStatus(todayLog, target, lastLog, hoursSinceLastCheckin)
      expect(status).toBe('green')
    })

    it('should return yellow for completed day with >15% deviation', () => {
      const todayLog = {
        actual_calories: 1600,
        is_completed: true,
      }
      const target = { calories: 2000 }
      const lastLog = { date: '2024-01-15' }
      const hoursSinceLastCheckin = 12

      const status = calculateClientStatus(todayLog, target, lastLog, hoursSinceLastCheckin)
      expect(status).toBe('yellow')
    })

    it('should return red for incomplete day with >15% deviation', () => {
      const todayLog = {
        actual_calories: 1600,
        is_completed: false,
      }
      const target = { calories: 2000 }
      const lastLog = { date: '2024-01-15' }
      const hoursSinceLastCheckin = 12

      const status = calculateClientStatus(todayLog, target, lastLog, hoursSinceLastCheckin)
      expect(status).toBe('red')
    })

    it('should return yellow for incomplete day within 15%', () => {
      const todayLog = {
        actual_calories: 1900,
        is_completed: false,
      }
      const target = { calories: 2000 }
      const lastLog = { date: '2024-01-15' }
      const hoursSinceLastCheckin = 12

      const status = calculateClientStatus(todayLog, target, lastLog, hoursSinceLastCheckin)
      expect(status).toBe('yellow')
    })

    it('should handle zero target calories', () => {
      const todayLog = {
        actual_calories: 100,
        is_completed: false,
      }
      const target = { calories: 0 }
      const lastLog = { date: '2024-01-15' }
      const hoursSinceLastCheckin = 12

      const status = calculateClientStatus(todayLog, target, lastLog, hoursSinceLastCheckin)
      // When target is 0, diff = 1 (100% deviation), which is > 0.15, incomplete = red
      expect(status).toBe('red')
    })
  })

  describe('Status without Today Log', () => {
    it('should return grey if never checked in', () => {
      const todayLog = null
      const target = { calories: 2000 }
      const lastLog = null
      const hoursSinceLastCheckin = null

      const status = calculateClientStatus(todayLog, target, lastLog, hoursSinceLastCheckin)
      expect(status).toBe('grey')
    })

    it('should return red if no check-in for >48 hours', () => {
      const todayLog = null
      const target = { calories: 2000 }
      const lastLog = { date: '2024-01-13' }
      const hoursSinceLastCheckin = 50

      const status = calculateClientStatus(todayLog, target, lastLog, hoursSinceLastCheckin)
      expect(status).toBe('red')
    })

    it('should return yellow if no check-in for 24-48 hours', () => {
      const todayLog = null
      const target = { calories: 2000 }
      const lastLog = { date: '2024-01-14' }
      const hoursSinceLastCheckin = 30

      const status = calculateClientStatus(todayLog, target, lastLog, hoursSinceLastCheckin)
      expect(status).toBe('yellow')
    })

    it('should return grey if check-in was recent (<24 hours)', () => {
      const todayLog = null
      const target = { calories: 2000 }
      const lastLog = { date: '2024-01-14' }
      const hoursSinceLastCheckin = 12

      const status = calculateClientStatus(todayLog, target, lastLog, hoursSinceLastCheckin)
      expect(status).toBe('grey')
    })
  })

  describe('Edge Cases', () => {
    it('should handle exactly 15% deviation', () => {
      const todayLog = {
        actual_calories: 1700, // Exactly 15% below 2000
        is_completed: true,
      }
      const target = { calories: 2000 }
      const lastLog = { date: '2024-01-15' }
      const hoursSinceLastCheckin = 12

      const status = calculateClientStatus(todayLog, target, lastLog, hoursSinceLastCheckin)
      expect(status).toBe('green') // <= 15% should be green
    })

    it('should handle exactly 24 hours since last check-in', () => {
      const todayLog = null
      const target = { calories: 2000 }
      const lastLog = { date: '2024-01-14' }
      const hoursSinceLastCheckin = 24

      const status = calculateClientStatus(todayLog, target, lastLog, hoursSinceLastCheckin)
      // Exactly 24 hours is not > 24, so should be grey
      expect(status).toBe('grey')
    })

    it('should handle exactly 48 hours since last check-in', () => {
      const todayLog = null
      const target = { calories: 2000 }
      const lastLog = { date: '2024-01-13' }
      const hoursSinceLastCheckin = 48

      const status = calculateClientStatus(todayLog, target, lastLog, hoursSinceLastCheckin)
      // Exactly 48 hours is not > 48, so should be yellow (> 24 but <= 48)
      expect(status).toBe('yellow')
    })

    it('should handle very high calorie deviation', () => {
      const todayLog = {
        actual_calories: 5000,
        is_completed: false,
      }
      const target = { calories: 2000 }
      const lastLog = { date: '2024-01-15' }
      const hoursSinceLastCheckin = 12

      const status = calculateClientStatus(todayLog, target, lastLog, hoursSinceLastCheckin)
      expect(status).toBe('red') // > 15% deviation and incomplete
    })
  })
})

