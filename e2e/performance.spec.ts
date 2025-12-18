/**
 * Performance Tests
 * Tests page load times, API response times, and rendering performance
 */

import { test, expect } from '@playwright/test'

test.describe('Performance Tests', () => {
  test('landing page should load quickly', async ({ page }) => {
    const startTime = Date.now()
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const loadTime = Date.now() - startTime
    
    // Landing page should load in under 2 seconds
    expect(loadTime).toBeLessThan(2000)
    
    // Check Web Vitals
    const metrics = await page.evaluate(() => {
      return {
        // Performance timing
        domContentLoaded: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
        loadComplete: performance.timing.loadEventEnd - performance.timing.navigationStart,
      }
    })
    
    expect(metrics.domContentLoaded).toBeLessThan(1500)
    expect(metrics.loadComplete).toBeLessThan(2000)
  })

  test('dashboard should load within acceptable time', async ({ page }) => {
    // This requires authentication setup
    await page.goto('/app/dashboard')
    
    const startTime = Date.now()
    await page.waitForLoadState('networkidle')
    const loadTime = Date.now() - startTime
    
    // Dashboard should load in under 3 seconds
    expect(loadTime).toBeLessThan(3000)
  })

  test('nutrition page should render form quickly', async ({ page }) => {
    await page.goto('/app/nutrition')
    
    const startTime = Date.now()
    await page.waitForSelector('input[type="text"]', { state: 'visible' })
    const renderTime = Date.now() - startTime
    
    // Form should render in under 1 second
    expect(renderTime).toBeLessThan(1000)
  })

  test('should handle multiple rapid interactions', async ({ page }) => {
    await page.goto('/app/nutrition')
    
    const startTime = Date.now()
    
    // Rapid interactions
    for (let i = 0; i < 5; i++) {
      await page.fill('input[placeholder*="название"]', `Meal ${i}`)
      await page.fill('input[placeholder*="калории"]', '100')
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
    }
    
    const interactionTime = Date.now() - startTime
    
    // Should handle interactions smoothly
    expect(interactionTime).toBeLessThan(2000)
  })

  test('should not have memory leaks on navigation', async ({ page }) => {
    await page.goto('/')
    
    // Navigate multiple times
    for (let i = 0; i < 5; i++) {
      await page.goto('/app/dashboard')
      await page.goto('/app/nutrition')
      await page.goto('/')
    }
    
    // Check memory usage (basic check)
    const memory = await page.evaluate(() => {
      // @ts-ignore
      return performance.memory ? performance.memory.usedJSHeapSize : 0
    })
    
    // Memory should be reasonable (less than 50MB for simple navigation)
    if (memory > 0) {
      expect(memory).toBeLessThan(50 * 1024 * 1024)
    }
  })

  test('API responses should be fast', async ({ page }) => {
    await page.goto('/app/dashboard')
    
    // Monitor network requests
    const requests: number[] = []
    
    page.on('response', (response) => {
      requests.push(response.request().timing().responseEnd - response.request().timing().requestStart)
    })
    
    await page.waitForLoadState('networkidle')
    
    // Average API response time should be under 500ms
    if (requests.length > 0) {
      const avgResponseTime = requests.reduce((a, b) => a + b, 0) / requests.length
      expect(avgResponseTime).toBeLessThan(500)
    }
  })

  test('should have acceptable Time to Interactive (TTI)', async ({ page }) => {
    await page.goto('/')
    
    // Measure TTI (simplified)
    const tti = await page.evaluate(() => {
      const perfData = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
      return perfData.domInteractive - perfData.fetchStart
    })
    
    // TTI should be under 2 seconds for landing page
    expect(tti).toBeLessThan(2000)
  })

  test('should handle large data sets efficiently', async ({ page }) => {
    await page.goto('/app/dashboard')
    
    // Simulate loading dashboard with many meals
    const startTime = Date.now()
    
    // Wait for data to load
    await page.waitForSelector('text=/калории|calories/i', { timeout: 5000 })
    
    const loadTime = Date.now() - startTime
    
    // Should load even with data in reasonable time
    expect(loadTime).toBeLessThan(3000)
  })
})

