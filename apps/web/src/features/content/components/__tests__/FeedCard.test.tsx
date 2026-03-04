import React from 'react';
import { render, screen } from '@testing-library/react';
import { FeedCard } from '../FeedCard';
import type { ArticleCard } from '@/features/content/types';

// Mock Next.js Link component
jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ href, children, ...props }: any) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

// Mock Next.js Image component
jest.mock('next/image', () => ({
    __esModule: true,
    default: (props: any) => {
        const { fill, ...imgProps } = props;
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
        return <img {...imgProps} data-fill={fill ? 'true' : 'false'} />;
    },
}));

const baseArticle: ArticleCard = {
    id: 'article-1',
    author_name: 'Test Author',
    title: 'Как правильно питаться',
    excerpt: 'Краткое описание статьи о питании',
    category: 'nutrition',
    published_at: '2026-03-01T12:00:00Z',
};

describe('FeedCard', () => {
    it('renders title and excerpt', () => {
        render(<FeedCard article={baseArticle} />);
        expect(screen.getByText('Как правильно питаться')).toBeInTheDocument();
        expect(screen.getByText('Краткое описание статьи о питании')).toBeInTheDocument();
    });

    it('renders category label in Russian', () => {
        render(<FeedCard article={baseArticle} />);
        expect(screen.getByText('Питание')).toBeInTheDocument();
    });

    it('renders category labels for all categories', () => {
        const categories = [
            { category: 'nutrition' as const, label: 'Питание' },
            { category: 'training' as const, label: 'Тренировки' },
            { category: 'recipes' as const, label: 'Рецепты' },
            { category: 'health' as const, label: 'Здоровье' },
            { category: 'motivation' as const, label: 'Мотивация' },
            { category: 'general' as const, label: 'Общее' },
        ];

        for (const { category, label } of categories) {
            const { unmount } = render(
                <FeedCard article={{ ...baseArticle, category }} />
            );
            expect(screen.getByText(label)).toBeInTheDocument();
            unmount();
        }
    });

    it('renders published date', () => {
        render(<FeedCard article={baseArticle} />);
        // toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
        // The exact format depends on the locale, so we check for the year at minimum
        const dateEl = screen.getByText(/2026/);
        expect(dateEl).toBeInTheDocument();
    });

    it('does not render date when published_at is missing', () => {
        const articleWithoutDate: ArticleCard = {
            ...baseArticle,
            published_at: undefined,
        };
        const { container } = render(<FeedCard article={articleWithoutDate} />);
        // The date paragraph should not be present
        const paragraphs = container.querySelectorAll('p');
        const dateTexts = Array.from(paragraphs).map((p) => p.textContent);
        expect(dateTexts.every((t) => !t?.match(/2026/))).toBe(true);
    });

    it('links to /content/{id}', () => {
        render(<FeedCard article={baseArticle} />);
        const link = screen.getByRole('link');
        expect(link).toHaveAttribute('href', '/content/article-1');
    });

    it('shows cover image when provided', () => {
        const articleWithCover: ArticleCard = {
            ...baseArticle,
            cover_image_url: 'https://example.com/image.jpg',
        };
        render(<FeedCard article={articleWithCover} />);
        const img = screen.getByRole('img');
        expect(img).toHaveAttribute('src', 'https://example.com/image.jpg');
        expect(img).toHaveAttribute('alt', baseArticle.title);
    });

    it('works without cover image', () => {
        const articleNoCover: ArticleCard = {
            ...baseArticle,
            cover_image_url: undefined,
        };
        render(<FeedCard article={articleNoCover} />);
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
        // Title should still render
        expect(screen.getByText(baseArticle.title)).toBeInTheDocument();
    });
});
