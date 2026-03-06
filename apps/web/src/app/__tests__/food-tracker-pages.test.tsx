/**
 * Unit tests for food tracker page components
 * Tests that Next.js food tracker pages render their feature components
 */

import React from 'react'
import { render, screen } from '@testing-library/react'

// Mock next/navigation
jest.mock('next/navigation', () => ({
    useRouter: () => ({
        push: jest.fn(),
        replace: jest.fn(),
        back: jest.fn(),
    }),
}))

// Mock the client components that the pages wrap
jest.mock('../food-tracker/FoodTrackerPageClient', () => ({
    FoodTrackerPageClient: () => (
        <div data-testid="food-tracker-page-client">FoodTrackerPageClient</div>
    ),
}))

jest.mock('../food-tracker/nutrient/[id]/NutrientDetailPageClient', () => ({
    NutrientDetailPageClient: ({ nutrientId }: { nutrientId: string }) => (
        <div data-testid="nutrient-detail-page-client">NutrientDetail {nutrientId}</div>
    ),
}))

import FoodTrackerPage from '../food-tracker/page'

describe('Food Tracker Pages', () => {
    describe('FoodTrackerPage', () => {
        it('renders FoodTrackerPageClient component', () => {
            render(<FoodTrackerPage />)
            expect(screen.getByTestId('food-tracker-page-client')).toBeInTheDocument()
        })
    })
})
