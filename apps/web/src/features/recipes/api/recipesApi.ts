import { apiClient } from '@/shared/utils/api-client'
import type {
    AdminListQuery,
    CatalogueFood,
    CatalogueQuery,
    Collection,
    FoodRestrictions,
    FoodRestrictionsInput,
    ImportResult,
    RecipeBundle,
    RecipeSummary,
    RecipeVersion,
    UploadedPhoto,
    VersionInput,
    VkusvillSearch,
} from '../types'

// Пути — литералами от констант этого файла: check-api-contract.mjs сверяет
// их с routes.golden, и путь, собранный иначе, для проверки невидим. Сама
// константа тоже читается как путь, поэтому база — только настоящий маршрут;
// у куратора `/curator/recipes` маршрутом не является, и пути там полные.
const ADMIN_BASE = '/api/v1/admin/recipes'
const CURATOR_CLIENTS_BASE = '/api/v1/curator/clients'
const CLIENT_BASE = '/api/v1/recipes'
const RESTRICTIONS_BASE = '/api/v1/food-restrictions'

/** Строка запроса без пустых значений, с ведущим `?` или пустая. */
function query(params: Record<string, string | number | undefined | null>): string {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue
        search.set(key, String(value))
    }
    const qs = search.toString()
    return qs ? `?${qs}` : ''
}

/** Клиент: каталог, карточка, отклонение, свои ограничения. */
export const recipesApi = {
    list: (params: CatalogueQuery = {}) =>
        apiClient.get<Collection<RecipeSummary>>(`${CLIENT_BASE}${query({ ...params })}`),

    get: (id: string) => apiClient.get<RecipeVersion>(`${CLIENT_BASE}/${id}`),

    reject: (id: string) => apiClient.post<void>(`${CLIENT_BASE}/${id}/reject`, {}),

    unreject: (id: string) => apiClient.delete<void>(`${CLIENT_BASE}/${id}/reject`),

    getRestrictions: () => apiClient.get<FoodRestrictions>(RESTRICTIONS_BASE),

    saveRestrictions: (input: FoodRestrictionsInput) =>
        apiClient.put<FoodRestrictions>(RESTRICTIONS_BASE, input),
}

/** Команда (`super_admin`): черновики, публикация, фото, импорт. */
export const adminRecipesApi = {
    list: (params: AdminListQuery = {}) =>
        apiClient.get<Collection<RecipeSummary>>(`${ADMIN_BASE}${query({ ...params })}`),

    create: (input: VersionInput) =>
        apiClient.post<{ recipe: RecipeSummary; version: RecipeVersion }>(ADMIN_BASE, input),

    get: (id: string) => apiClient.get<RecipeBundle>(`${ADMIN_BASE}/${id}`),

    saveDraft: (id: string, input: VersionInput) =>
        apiClient.put<RecipeVersion>(`${ADMIN_BASE}/${id}/draft`, input),

    submit: (id: string) => apiClient.post<RecipeVersion>(`${ADMIN_BASE}/${id}/submit`, {}),

    unpublish: (id: string) => apiClient.post<RecipeSummary>(`${ADMIN_BASE}/${id}/unpublish`, {}),

    publish: (id: string) => apiClient.post<RecipeSummary>(`${ADMIN_BASE}/${id}/publish`, {}),

    uploadPhoto: (file: File) => {
        const form = new FormData()
        form.append('file', file)
        return apiClient.postFormData<UploadedPhoto>(`${ADMIN_BASE}/photos`, form)
    },

    searchCatalogue: (q: string) =>
        apiClient.get<{ items: CatalogueFood[] }>(`${ADMIN_BASE}/catalogue-search${query({ q })}`),

    searchVkusvill: (q: string, page = 1) =>
        apiClient.get<VkusvillSearch>(`${ADMIN_BASE}/import/vkusvill${query({ q, page })}`),

    /**
     * `q` — название рецепта из выдачи: сервер берёт рецепт из кэша поиска, а
     * если кэш остыл, ищет его заново по этому названию (api.md, отклонение 3).
     */
    importVkusvill: (sourceRef: string, q: string) => {
        // Путь отдельным литералом: check-api-contract.mjs видит `${…}` в
        // конце пути как параметр, а склеенную следом строку запроса — нет.
        const path = `${ADMIN_BASE}/import/vkusvill/${encodeURIComponent(sourceRef)}`
        return apiClient.post<ImportResult>(path + query({ q }), {})
    },
}

/** Куратор (`coordinator`): проверка рецептов, ограничения и скрытия клиентов. */
export const curatorRecipesApi = {
    /** Опубликованные рецепты с одобренной версией — чтобы выбрать, что скрыть. */
    listPublished: (q: string, page = 1, pageSize = 20) =>
        apiClient.get<Collection<RecipeSummary>>(`/api/v1/curator/recipes${query({ q, page, page_size: pageSize })}`),

    reviewQueue: (page = 1) =>
        apiClient.get<Collection<RecipeSummary>>(`/api/v1/curator/recipes/review${query({ page })}`),

    get: (id: string) => apiClient.get<RecipeBundle>(`/api/v1/curator/recipes/${id}`),

    approve: (id: string, version?: VersionInput) =>
        apiClient.post<RecipeVersion>(`/api/v1/curator/recipes/${id}/approve`, version ? { version } : {}),

    returnToTeam: (id: string, comment: string) =>
        apiClient.post<RecipeVersion>(`/api/v1/curator/recipes/${id}/return`, { comment }),

    getClientRestrictions: (clientId: number) =>
        apiClient.get<FoodRestrictions>(`${CURATOR_CLIENTS_BASE}/${clientId}/food-restrictions`),

    saveClientRestrictions: (clientId: number, input: FoodRestrictionsInput) =>
        apiClient.put<FoodRestrictions>(`${CURATOR_CLIENTS_BASE}/${clientId}/food-restrictions`, input),

    hiddenRecipes: (clientId: number) =>
        apiClient.get<{ items: RecipeSummary[] }>(`${CURATOR_CLIENTS_BASE}/${clientId}/hidden-recipes`),

    hideRecipe: (clientId: number, recipeId: string) =>
        apiClient.put<void>(`${CURATOR_CLIENTS_BASE}/${clientId}/hidden-recipes/${recipeId}`, {}),

    unhideRecipe: (clientId: number, recipeId: string) =>
        apiClient.delete<void>(`${CURATOR_CLIENTS_BASE}/${clientId}/hidden-recipes/${recipeId}`),
}
