# Requirements Document

## Introduction

Интеграция с FatSecret API для предоставления пользователям доступа к обширной базе данных продуктов питания. FatSecret API станет основным источником данных о продуктах, а Open Food Facts API будет использоваться как резервный источник при отсутствии результатов.

## Glossary

- **FatSecret_API**: Внешний REST API сервис для получения информации о продуктах питания и их пищевой ценности
- **Product_Search**: Компонент системы для поиска продуктов питания
- **Product_Database**: Локальная база данных продуктов в PostgreSQL
- **OAuth_1.0**: Протокол аутентификации для доступа к FatSecret API
- **Fallback_Source**: Резервный источник данных (Open Food Facts API), используемый при отсутствии результатов из основного источника
- **KBJU**: Калории, Белки, Жиры, Углеводы - основные макронутриенты
- **User**: Пользователь приложения (клиент)
- **Meal_Entry**: Запись о приеме пищи в дневнике питания

## Requirements

### Requirement 1: FatSecret API Authentication

**User Story:** Как система, я хочу аутентифицироваться в FatSecret API, чтобы получить доступ к базе данных продуктов.

#### Acceptance Criteria

1. THE System SHALL authenticate with FatSecret API using OAuth 1.0 protocol
2. WHEN authentication credentials are invalid, THEN THE System SHALL log the error and return an appropriate error response
3. THE System SHALL store API credentials securely in environment variables
4. WHEN API rate limits are exceeded, THEN THE System SHALL handle the error gracefully and log the incident

### Requirement 2: Product Search via FatSecret API

**User Story:** Как пользователь, я хочу искать продукты в базе FatSecret, чтобы быстро находить нужные продукты с готовыми данными КБЖУ.

#### Acceptance Criteria

1. WHEN a User enters a search query of 2 or more characters, THEN THE Product_Search SHALL query FatSecret_API with the search term
2. WHEN FatSecret_API returns results, THEN THE System SHALL transform the results into the internal Product format
3. WHEN FatSecret_API returns no results, THEN THE System SHALL query the Fallback_Source (Open Food Facts API)
4. WHEN both FatSecret_API and Fallback_Source return no results, THEN THE System SHALL display a message indicating no products were found
5. THE System SHALL return search results within 3 seconds under normal conditions
6. WHEN FatSecret_API is unavailable, THEN THE System SHALL automatically use the Fallback_Source

### Requirement 3: Product Details Retrieval

**User Story:** Как пользователь, я хочу видеть детальную информацию о продукте из FatSecret, чтобы принять обоснованное решение о добавлении его в дневник.

#### Acceptance Criteria

1. WHEN a User selects a product from search results, THEN THE System SHALL display product name, brand, serving sizes, and nutritional information (KBJU per 100g)
2. THE System SHALL display product image if available from FatSecret_API
3. WHEN nutritional data is incomplete, THEN THE System SHALL display available data and indicate missing fields
4. THE System SHALL support multiple serving sizes provided by FatSecret_API

### Requirement 4: Product Data Caching

**User Story:** Как система, я хочу кэшировать данные продуктов из FatSecret, чтобы уменьшить количество API запросов и улучшить производительность.

#### Acceptance Criteria

1. WHEN a product is retrieved from FatSecret_API, THEN THE System SHALL save it to the Product_Database
2. WHEN searching for products, THEN THE System SHALL first check the Product_Database before querying FatSecret_API
3. THE System SHALL prioritize cached products by usage_count in search results
4. WHEN a cached product is selected, THEN THE System SHALL increment its usage_count
5. THE System SHALL store the source identifier (FatSecret ID) to prevent duplicate entries

### Requirement 5: Fallback Mechanism

**User Story:** Как система, я хочу иметь резервный источник данных, чтобы обеспечить непрерывную работу при недоступности основного API.

#### Acceptance Criteria

1. WHEN FatSecret_API returns no results for a search query, THEN THE System SHALL automatically query Open Food Facts API
2. WHEN FatSecret_API returns an error or is unavailable, THEN THE System SHALL automatically query Open Food Facts API
3. THE System SHALL combine results from Product_Database, FatSecret_API, and Fallback_Source in a single response
4. THE System SHALL indicate the source of each product (fatsecret, openfoodfacts, user) in the response
5. WHEN both APIs are unavailable, THEN THE System SHALL return only cached results from Product_Database

### Requirement 6: Barcode Search Support

**User Story:** Как пользователь, я хочу искать продукты по штрих-коду через FatSecret, чтобы быстро добавлять упакованные продукты.

#### Acceptance Criteria

1. WHEN a User enters a barcode, THEN THE System SHALL first check Product_Database for the barcode
2. WHEN the barcode is not found in Product_Database, THEN THE System SHALL query FatSecret_API barcode endpoint
3. WHEN FatSecret_API returns no result for the barcode, THEN THE System SHALL query the Fallback_Source
4. WHEN a product is found by barcode, THEN THE System SHALL display the product details immediately
5. THE System SHALL save barcode-found products to Product_Database for future use

### Requirement 7: Multi-language Support

**User Story:** Как русскоязычный пользователь, я хочу видеть названия продуктов на русском языке, чтобы легче находить нужные продукты.

#### Acceptance Criteria

1. WHEN FatSecret_API returns product names, THEN THE System SHALL prioritize Russian language names if available
2. WHEN Russian names are not available, THEN THE System SHALL display English names
3. THE System SHALL store both Russian and English names in Product_Database when available
4. WHEN searching, THE System SHALL support queries in both Russian and English

### Requirement 8: Error Handling and Logging

**User Story:** Как разработчик, я хочу иметь подробное логирование API взаимодействий, чтобы диагностировать проблемы и отслеживать использование.

#### Acceptance Criteria

1. WHEN an API request is made to FatSecret_API, THEN THE System SHALL log the request parameters and timestamp
2. WHEN an API error occurs, THEN THE System SHALL log the error details, status code, and context
3. WHEN fallback to Open Food Facts occurs, THEN THE System SHALL log the reason for fallback
4. THE System SHALL track API usage metrics (request count, success rate, response time)
5. WHEN rate limits are approached, THEN THE System SHALL log a warning

### Requirement 9: Product Selection and Meal Entry

**User Story:** Как пользователь, я хочу добавлять найденные продукты в мой дневник питания, чтобы отслеживать потребление КБЖУ.

#### Acceptance Criteria

1. WHEN a User selects a product and specifies weight, THEN THE System SHALL calculate KBJU based on the specified weight
2. WHEN a product is added to a Meal_Entry, THEN THE System SHALL record the product usage in product_usage_history
3. WHEN a product is added to a Meal_Entry, THEN THE System SHALL increment the product's usage_count
4. THE System SHALL support adding products with custom serving sizes (grams, ml, pieces)
5. WHEN a product is added, THEN THE System SHALL save the product to Product_Database if not already cached

### Requirement 10: Favorite Products

**User Story:** Как пользователь, я хочу добавлять некоторые продукты в "избранные", чтобы быстрее находить и добавлять их в дневник питания.

#### Acceptance Criteria

1. WHEN a User views a product, THEN THE System SHALL display an option to add the product to favorites
2. WHEN a User adds a product to favorites, THEN THE System SHALL save the favorite association in the database
3. WHEN a User removes a product from favorites, THEN THE System SHALL delete the favorite association
4. THE Product_Search SHALL display a "Favorites" tab showing all favorited products
5. WHEN a User opens the favorites tab, THEN THE System SHALL display products ordered by most recently added
6. THE System SHALL indicate which products are favorited in search results
7. WHEN a User adds a product from FatSecret_API to favorites, THEN THE System SHALL first save the product to Product_Database

### Requirement 11: API Configuration

**User Story:** Как администратор системы, я хочу легко настраивать параметры API, чтобы управлять интеграцией без изменения кода.

#### Acceptance Criteria

1. THE System SHALL read FatSecret API credentials from environment variables
2. THE System SHALL support configuration of API timeout values
3. THE System SHALL support configuration of maximum results per search
4. THE System SHALL support enabling/disabling fallback to Open Food Facts API
5. WHEN required environment variables are missing, THEN THE System SHALL log an error and disable FatSecret integration
