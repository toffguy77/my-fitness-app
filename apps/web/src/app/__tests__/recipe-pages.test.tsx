/**
 * Страницы каталога рецептов передают своим экранам то, что взяли из адреса.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'

let mockParams: Record<string, string> = {}
jest.mock('next/navigation', () => ({ useParams: () => mockParams }))

jest.mock('@/features/recipes', () => ({
    RecipeCatalogue: () => <div data-testid="catalogue" />,
    RecipeDetail: ({ id }: { id: string }) => <div data-testid="detail">{id}</div>,
    AdminRecipeList: () => <div data-testid="admin-list" />,
    AdminRecipeEditor: ({ recipeId }: { recipeId: string | null }) => (
        <div data-testid="admin-editor">{recipeId ?? 'new'}</div>
    ),
    ReviewQueue: () => <div data-testid="review-queue" />,
    CuratorRecipeReview: ({ recipeId }: { recipeId: string }) => <div data-testid="review">{recipeId}</div>,
    ClientFoodRestrictions: () => <div data-testid="client-restrictions" />,
}))

jest.mock('@/shared/components/RoleShell', () => ({
    RoleShell: ({ children, activeNavItem }: { children: React.ReactNode; activeNavItem?: string }) => (
        <div data-testid="role-shell" data-active={activeNavItem}>
            {children}
        </div>
    ),
}))

jest.mock('@/features/settings/components/SettingsPageLayout', () => ({
    SettingsPageLayout: ({ title, children }: { title: string; children: () => React.ReactNode }) => (
        <div>
            <h1>{title}</h1>
            {children()}
        </div>
    ),
}))

import MenuLayout from '../menu/layout'
import MenuPage from '../menu/page'
import MenuLoading from '../menu/loading'
import MenuRecipePage from '../menu/recipes/[id]/page'
import AdminRecipesPage from '../admin/recipes/page'
import AdminNewRecipePage from '../admin/recipes/new/page'
import AdminRecipePage from '../admin/recipes/[id]/page'
import CuratorRecipesPage from '../curator/recipes/page'
import CuratorRecipePage from '../curator/recipes/[id]/page'
import SettingsFoodRestrictionsPage from '../settings/food-restrictions/page'

describe('страницы каталога рецептов', () => {
    it('«Меню» в клиентской оболочке с активным пунктом «Меню»', () => {
        render(
            <MenuLayout>
                <MenuPage />
            </MenuLayout>
        )
        expect(screen.getByTestId('role-shell')).toHaveAttribute('data-active', 'menu')
        expect(screen.getByTestId('catalogue')).toBeInTheDocument()
    })

    it('ожидание раздела подписано', () => {
        render(<MenuLoading />)
        expect(screen.getByRole('status')).toBeInTheDocument()
    })

    it('карточка, редактор и проверка получают id из адреса', () => {
        mockParams = { id: 'r-1' }
        render(<MenuRecipePage />)
        expect(screen.getByTestId('detail')).toHaveTextContent('r-1')
        render(<AdminRecipePage />)
        expect(screen.getByTestId('admin-editor')).toHaveTextContent('r-1')
        render(<CuratorRecipePage />)
        expect(screen.getByTestId('review')).toHaveTextContent('r-1')
    })

    it('«Новый рецепт» — редактор без id', () => {
        render(<AdminNewRecipePage />)
        expect(screen.getByTestId('admin-editor')).toHaveTextContent('new')
    })

    it('списки команды и куратора', () => {
        render(<AdminRecipesPage />)
        expect(screen.getByTestId('admin-list')).toBeInTheDocument()
        render(<CuratorRecipesPage />)
        expect(screen.getByTestId('review-queue')).toBeInTheDocument()
    })

    it('«Ограничения в питании» в настройках', () => {
        render(<SettingsFoodRestrictionsPage />)
        expect(screen.getByRole('heading', { name: 'Ограничения в питании' })).toBeInTheDocument()
        expect(screen.getByTestId('client-restrictions')).toBeInTheDocument()
    })
})
