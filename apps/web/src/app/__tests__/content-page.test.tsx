/**
 * Unit tests for content feed page
 */

import React from 'react'
import { render, screen } from '@testing-library/react'

// Mock the FeedList component
jest.mock('@/features/content/components/FeedList', () => ({
    FeedList: () => <div data-testid="feed-list">FeedList</div>,
}))

import ContentFeedPage from '../content/page'

describe('ContentFeedPage', () => {
    it('renders the page title', () => {
        render(<ContentFeedPage />)
        expect(screen.getByText('Статьи')).toBeInTheDocument()
    })

    it('renders the FeedList component', () => {
        render(<ContentFeedPage />)
        expect(screen.getByTestId('feed-list')).toBeInTheDocument()
    })
})
