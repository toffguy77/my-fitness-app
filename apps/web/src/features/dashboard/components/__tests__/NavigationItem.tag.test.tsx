import { render, screen } from '@testing-library/react'
import { ChefHat } from 'lucide-react'
import { NavigationItem } from '../NavigationItem'
import { NAVIGATION_ITEMS } from '../../utils/navigationConfig'

describe('NavigationItem: плашка «бета»', () => {
    it('видна, но имя пункта остаётся подписью', () => {
        render(<NavigationItem id="menu" label="Меню" icon={ChefHat} href="/menu" tag="бета" />)
        expect(screen.getByTestId('nav-tag-menu')).toHaveTextContent('бета')
        expect(screen.getByRole('button', { name: 'Меню' })).toBeInTheDocument()
    })

    it('уступает место счётчику непрочитанного', () => {
        render(<NavigationItem id="menu" label="Меню" icon={ChefHat} href="/menu" tag="бета" badge={3} />)
        expect(screen.queryByTestId('nav-tag-menu')).not.toBeInTheDocument()
        expect(screen.getByText('3')).toBeInTheDocument()
    })

    it('без tag плашки нет', () => {
        render(<NavigationItem id="chat" label="Чат" icon={ChefHat} href="/chat" />)
        expect(screen.queryByTestId('nav-tag-chat')).not.toBeInTheDocument()
    })

    it('в навигации клиента бета — только у «Меню»', () => {
        const tagged = NAVIGATION_ITEMS.filter((item) => item.tag).map((item) => [item.id, item.tag])
        expect(tagged).toEqual([['menu', 'бета']])
    })
})
