/**
 * Утилита для работы с браузерными уведомлениями
 */

/**
 * Запрашивает разрешение на показ уведомлений
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false
  }

  if (Notification.permission === 'granted') {
    return true
  }

  if (Notification.permission === 'denied') {
    return false
  }

  // Запрашиваем разрешение
  const permission = await Notification.requestPermission()
  return permission === 'granted'
}

/**
 * Показывает браузерное уведомление
 */
export async function showNotification(
  title: string,
  options?: NotificationOptions
): Promise<Notification | null> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return null
  }

  const hasPermission = await requestNotificationPermission()
  if (!hasPermission) {
    return null
  }

  try {
    return new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      ...options,
    })
  } catch (error) {
    console.error('Ошибка показа уведомления:', error)
    return null
  }
}

/**
 * Проверяет, поддерживаются ли уведомления
 */
export function isNotificationSupported(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return 'Notification' in window
}

/**
 * Проверяет, есть ли разрешение на уведомления
 */
export function hasNotificationPermission(): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false
  }
  return Notification.permission === 'granted'
}




