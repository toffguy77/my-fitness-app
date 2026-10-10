/**
 * Рецепты в поиске дневника: пометка «рецепт» и переход к карточке рецепта
 * (openspec plan-diary-logging, задача 5.3).
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchTab } from '../SearchTab';
import type { FoodItem } from '../../types';

function food(overrides: Partial<FoodItem> = {}): FoodItem {
    return {
        id: 'food-1',
        name: 'Плов с курицей',
        category: 'Блюда',
        servingSize: 350,
        servingUnit: 'g',
        nutritionPer100: { calories: 150, protein: 9, fat: 4, carbs: 18 },
        source: 'database',
        verified: true,
        ...overrides,
    };
}

const RECIPE = food({ id: 'recipe-food-1', source: 'recipe', recipeId: 'recipe-1' });
const PRODUCT = food({ id: 'product-1', name: 'Плов из пакета' });

async function search(onSelectFood = jest.fn()) {
    const user = userEvent.setup();
    render(<SearchTab onSelectFood={onSelectFood} onSearch={jest.fn().mockResolvedValue([RECIPE, PRODUCT])} />);
    await user.type(screen.getByRole('textbox', { name: /поиск/i }), 'плов');
    return { user, onSelectFood };
}

describe('SearchTab — рецепты', () => {
    it('рецепт помечен «рецепт» и ведёт к карточке; продукт — без пометки', async () => {
        await search();

        const recipe = await screen.findByRole('option', { name: /Плов с курицей/ });
        expect(within(recipe).getByText('рецепт')).toBeInTheDocument();
        expect(within(recipe).getByRole('link', { name: 'Открыть рецепт «Плов с курицей»' })).toHaveAttribute(
            'href',
            '/menu/recipes/recipe-1'
        );

        const product = screen.getByRole('option', { name: /Плов из пакета/ });
        expect(within(product).queryByText('рецепт')).not.toBeInTheDocument();
        expect(within(product).queryByRole('link')).not.toBeInTheDocument();
    });

    it('выбор рецепта — как выбор любого продукта', async () => {
        const { user, onSelectFood } = await search();
        await user.click(await screen.findByText('Плов с курицей'));
        expect(onSelectFood).toHaveBeenCalledWith(RECIPE);
    });

    it('переход к карточке не выбирает блюдо — ни щелчком, ни клавишей', async () => {
        const { onSelectFood } = await search();
        const link = await screen.findByRole('link', { name: 'Открыть рецепт «Плов с курицей»' });

        fireEvent.click(link);
        fireEvent.keyDown(link, { key: 'Enter' });
        expect(onSelectFood).not.toHaveBeenCalled();
    });

    it('рецепт без идентификатора — пометка есть, ссылки нет', async () => {
        const user = userEvent.setup();
        const orphan = food({ id: 'r2', source: 'recipe' });
        render(<SearchTab onSelectFood={jest.fn()} onSearch={jest.fn().mockResolvedValue([orphan])} />);
        await user.type(screen.getByRole('textbox', { name: /поиск/i }), 'плов');

        const option = await screen.findByRole('option', { name: /Плов с курицей/ });
        expect(within(option).getByText('рецепт')).toBeInTheDocument();
        expect(within(option).queryByRole('link')).not.toBeInTheDocument();
    });
});
