/**
 * Страницы каталога рецептов передают своим экранам то, что взяли из адреса.
 */
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { track } from '@/shared/analytics'

let mockParams: Record<string, string> = {}
let mockSearch = new URLSearchParams()
const mockReplace = jest.fn()
jest.mock('next/navigation', () => ({
    useParams: () => mockParams,
    useSearchParams: () => mockSearch,
    useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
}))
jest.mock('@/shared/analytics', () => ({
    EVENTS: jest.requireActual('@/shared/analytics/events').EVENTS,
    track: jest.fn(),
}))

jest.mock('@/features/recipes', () => ({
    RecipeCatalogue: ({ embedded }: { embedded?: boolean }) => (
        <div data-testid="catalogue" data-embedded={String(!!embedded)} />
    ),
    RecipeDetail: ({ id }: { id: string }) => <div data-testid="detail">{id}</div>,
    AdminRecipeList: () => <div data-testid="admin-list" />,
    AdminRecipeEditor: ({ recipeId }: { recipeId: string | null }) => (
        <div data-testid="admin-editor">{recipeId ?? 'new'}</div>
    ),
    ReviewQueue: () => <div data-testid="review-queue" />,
    CuratorRecipeReview: ({ recipeId }: { recipeId: string }) => <div data-testid="review">{recipeId}</div>,
    ClientFoodRestrictions: () => <div data-testid="client-restrictions" />,
}))

jest.mock('@/features/meal-plan', () => ({
    BetaNotice: jest.requireActual('@/features/meal-plan/components/BetaNotice').BetaNotice,
    DayPlanView: () => <div data-testid="day-plan" />,
    MealPlanSettingsForm: () => <div data-testid="meal-plan-settings" />,
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
    beforeEach(() => {
        mockSearch = new URLSearchParams()
        jest.clearAllMocks()
    })

    it('«Меню» в клиентской оболочке открывается на плане дня', () => {
        render(
            <MenuLayout>
                <MenuPage />
            </MenuLayout>
        )
        expect(screen.getByTestId('role-shell')).toHaveAttribute('data-active', 'menu')
        expect(screen.getByRole('heading', { level: 1, name: 'Меню' })).toBeInTheDocument()
        expect(screen.getByRole('complementary', { name: /Бета-версия/ })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: 'План' })).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByRole('tabpanel')).toContainElement(screen.getByTestId('day-plan'))
        expect(screen.queryByTestId('catalogue')).not.toBeInTheDocument()
        expect(track).toHaveBeenCalledWith('menu_opened')
    })

    it('?tab=recipes — каталог во вкладке «Рецепты»', () => {
        mockSearch = new URLSearchParams('tab=recipes')
        render(<MenuPage />)
        expect(screen.getByRole('tab', { name: 'Рецепты' })).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByTestId('catalogue')).toHaveAttribute('data-embedded', 'true')
        expect(screen.queryByTestId('day-plan')).not.toBeInTheDocument()
    })

    it('вкладки переключают адрес, стрелки — тоже', () => {
        render(<MenuPage />)
        fireEvent.click(screen.getByRole('tab', { name: 'Рецепты' }))
        expect(mockReplace).toHaveBeenLastCalledWith('/menu?tab=recipes', { scroll: false })

        fireEvent.keyDown(screen.getByRole('tab', { name: 'План' }), { key: 'ArrowRight' })
        expect(mockReplace).toHaveBeenLastCalledWith('/menu?tab=recipes', { scroll: false })
        fireEvent.keyDown(screen.getByRole('tab', { name: 'План' }), { key: 'ArrowLeft' })
        expect(mockReplace).toHaveBeenLastCalledWith('/menu?tab=recipes', { scroll: false })

        mockSearch = new URLSearchParams('tab=recipes')
        render(<MenuPage />)
        fireEvent.click(screen.getAllByRole('tab', { name: 'План' })[1])
        expect(mockReplace).toHaveBeenLastCalledWith('/menu', { scroll: false })
        fireEvent.keyDown(screen.getAllByRole('tab', { name: 'План' })[1], { key: 'Enter' })
        expect(mockReplace).toHaveBeenCalledTimes(4)
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
        expect(screen.getByTestId('meal-plan-settings')).toBeInTheDocument()
    })
})
