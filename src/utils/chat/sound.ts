/**
 * Утилита для воспроизведения звуковых уведомлений в чате
 */

let notificationSoundRef: { play: () => void } | null = null

/**
 * Инициализация звука уведомления
 */
export function initNotificationSound(): void {
  if (typeof window === 'undefined') return
  
  // Создаем простой звук уведомления (beep)
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
  const audioContext = new AudioContextClass()
  const oscillator = audioContext.createOscillator()
  const gainNode = audioContext.createGain()

  oscillator.connect(gainNode)
  gainNode.connect(audioContext.destination)

  oscillator.frequency.value = 800
  oscillator.type = 'sine'
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1)

  oscillator.start(audioContext.currentTime)
  oscillator.stop(audioContext.currentTime + 0.1)

  // Сохраняем функцию для воспроизведения
  notificationSoundRef = {
    play: () => {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        osc.connect(gain)
        gain.connect(ctx.destination)

        osc.frequency.value = 800
        osc.type = 'sine'
        gain.gain.setValueAtTime(0.3, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1)

        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.1)
      } catch (error) {
        // Игнорируем ошибки воспроизведения звука
      }
    }
  }
}

/**
 * Воспроизведение звука уведомления
 */
export function playNotificationSound(): void {
  if (!notificationSoundRef) {
    initNotificationSound()
  }
  
  if (notificationSoundRef) {
    notificationSoundRef.play()
  }
}

