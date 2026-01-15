'use client'

import { useEffect, useRef } from 'react'

interface SwipeGestureOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  threshold?: number // Минимальное расстояние для распознавания свайпа (px)
  minVelocity?: number // Минимальная скорость для распознавания свайпа (px/ms)
}

export function useSwipeGesture(
  elementRef: React.RefObject<HTMLElement>,
  options: SwipeGestureOptions
) {
  const { onSwipeLeft, onSwipeRight, threshold = 50, minVelocity = 0.3 } = options
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return

      const touch = e.changedTouches[0]
      const deltaX = touch.clientX - touchStartRef.current.x
      const deltaY = touch.clientY - touchStartRef.current.y
      const deltaTime = Date.now() - touchStartRef.current.time
      const velocity = Math.abs(deltaX) / deltaTime

      // Проверяем, что это горизонтальный свайп (не вертикальный)
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > threshold && velocity > minVelocity) {
        if (deltaX > 0 && onSwipeRight) {
          // Свайп вправо
          onSwipeRight()
        } else if (deltaX < 0 && onSwipeLeft) {
          // Свайп влево
          onSwipeLeft()
        }
      }

      touchStartRef.current = null
    }

    element.addEventListener('touchstart', handleTouchStart, { passive: true })
    element.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchend', handleTouchEnd)
    }
  }, [elementRef, onSwipeLeft, onSwipeRight, threshold, minVelocity])
}
