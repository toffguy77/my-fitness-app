# Localization Guidelines

## Primary Language: Russian

**BURCEV is a Russian-language application. ALL user-facing content MUST be in Russian.**

## What Must Be Localized

### Frontend (TypeScript/React)

1. **Validation Error Messages**
   ```typescript
   // ✅ CORRECT
   error: 'Вес должен быть положительным'
   error: 'Шаги не могут быть отрицательными'
   error: 'Калории должны быть не более 10,000'
   error: 'Фото должно быть в формате JPEG, PNG или WebP'
   error: 'Файл фото пустой'
   
   // ❌ WRONG
   error: 'Weight must be positive'
   error: 'Steps cannot be negative'
   ```

2. **Zod Schema Messages**
   ```typescript
   // ✅ CORRECT
   z.object({
       startDate: z.date(),
       endDate: z.date(),
   }).refine(data => data.endDate >= data.startDate, {
       message: "Дата окончания должна быть не раньше даты начала",
       path: ["endDate"],
   })
   
   // ❌ WRONG
   message: "End date must be after or equal to start date"
   ```

3. **Toast Notifications**
   ```typescript
   // ✅ CORRECT
   toast.success('Данные успешно сохранены')
   toast.error('Не удалось загрузить данные')
   
   // ❌ WRONG
   toast.success('Data saved successfully')
   ```

4. **UI Labels and Text**
   ```typescript
   // ✅ CORRECT
   <button>Сохранить</button>
   <label>Введите вес</label>
   
   // ❌ WRONG
   <button>Save</button>
   <label>Enter weight</label>
   ```

5. **Form Validation Messages**
   ```typescript
   // ✅ CORRECT
   const errors = {
       email: 'Введите корректный email',
       password: 'Пароль должен содержать минимум 8 символов',
   }
   
   // ❌ WRONG
   const errors = {
       email: 'Please enter a valid email',
       password: 'Password must be at least 8 characters',
   }
   ```

### Backend (Go)

1. **API Error Responses**
   ```go
   // ✅ CORRECT
   response.Error(c, http.StatusBadRequest, "Неверный формат данных", nil)
   response.Error(c, http.StatusNotFound, "Пользователь не найден", nil)
   
   // ❌ WRONG
   response.Error(c, http.StatusBadRequest, "Invalid data format", nil)
   ```

2. **Validation Errors**
   ```go
   // ✅ CORRECT
   if weight <= 0 {
       return errors.New("вес должен быть положительным")
   }
   
   // ❌ WRONG
   if weight <= 0 {
       return errors.New("weight must be positive")
   }
   ```

## Testing Localization

### Unit Tests

Update test expectations to match Russian messages:

```typescript
// ✅ CORRECT
it('rejects negative weight', () => {
    const result = validateWeight(-10)
    expect(result.error).toBe('Вес должен быть положительным')
})

// ❌ WRONG
it('rejects negative weight', () => {
    const result = validateWeight(-10)
    expect(result.error).toBe('Weight must be positive')
})
```

### Property-Based Tests

Use Russian substrings in assertions:

```typescript
// ✅ CORRECT
expect(result.error).toContain('положительным')
expect(result.error).toContain('отрицательными')
expect(result.error).toContain('целым')
expect(result.error).toContain('запятой')

// ❌ WRONG
expect(result.error).toContain('positive')
expect(result.error).toContain('negative')
expect(result.error).toContain('whole')
expect(result.error).toContain('decimal')
```

## Common Translations

### Validation Messages

| English | Russian |
|---------|---------|
| must be a number | должен быть числом / должны быть числом |
| must be positive | должен быть положительным |
| cannot be negative | не может быть отрицательным / не могут быть отрицательными |
| must be a whole number | должен быть целым числом / должны быть целым числом |
| must be X or less | должен быть не более X / должны быть не более X |
| can have at most 1 decimal place | может иметь не более 1 знака после запятой |
| must be a valid number | должен быть корректным числом / должны быть корректным числом |
| must be in format | должно быть в формате |
| file is empty | файл пустой |

### UI Elements

| English | Russian |
|---------|---------|
| Save | Сохранить |
| Cancel | Отменить |
| Delete | Удалить |
| Edit | Редактировать |
| Submit | Отправить |
| Loading... | Загрузка... |
| Error | Ошибка |
| Success | Успешно |
| Weight | Вес |
| Steps | Шаги |
| Calories | Калории |
| Photo | Фото |

### Status Messages

| English | Russian |
|---------|---------|
| Data saved successfully | Данные успешно сохранены |
| Failed to load data | Не удалось загрузить данные |
| Invalid input | Неверный ввод |
| Required field | Обязательное поле |
| User not found | Пользователь не найден |
| Access denied | Доступ запрещен |

## Exceptions

The following MAY remain in English:
- Code comments
- Variable names
- Function names
- Log messages (internal, not user-facing)
- Technical documentation
- Git commit messages
- Test descriptions (optional, but user-facing assertions must be Russian)

## Checklist for New Features

When implementing a new feature:

- [ ] All validation error messages are in Russian
- [ ] All API error responses are in Russian
- [ ] All UI text and labels are in Russian
- [ ] All toast notifications are in Russian
- [ ] All form validation messages are in Russian
- [ ] All Zod schema messages are in Russian
- [ ] Unit tests expect Russian messages
- [ ] Property-based tests check Russian substrings
- [ ] No English user-facing text remains

## Migration Guide

If you find English user-facing text:

1. **Identify all occurrences**
   ```bash
   # Search for common English patterns
   grep -r "must be" apps/web/src/
   grep -r "cannot be" apps/web/src/
   grep -r "should be" apps/web/src/
   ```

2. **Update the source code**
   - Replace English messages with Russian equivalents
   - Use the translation table above

3. **Update tests**
   - Update unit test expectations
   - Update property-based test assertions
   - Run tests to verify: `npm test`

4. **Verify in UI**
   - Trigger validation errors
   - Check toast notifications
   - Review form error messages

## Examples from Codebase

### Validation Functions

See: `apps/web/src/features/dashboard/utils/validation.ts`

All validation functions return Russian error messages:
- `validateWeight()` - weight validation
- `validateSteps()` - steps validation
- `validateCalories()` - calories validation
- `validatePhoto()` - photo file validation

### Zod Schemas

See: `apps/web/src/features/dashboard/types.ts`

All Zod schemas use Russian error messages:
- `goalSchema` - goal validation
- `weeklyReportSchema` - weekly report validation

### Tests

See: 
- `apps/web/src/features/dashboard/utils/__tests__/validation.test.ts` - unit tests
- `apps/web/src/features/dashboard/utils/__tests__/validation.property.test.ts` - property tests

All tests expect Russian error messages.

## Resources

- Translation service: Use Google Translate or DeepL for complex phrases
- Grammar check: Use LanguageTool for Russian grammar
- Native speaker review: Recommended for important user-facing text

## Questions?

If unsure about a translation:
1. Check existing similar messages in the codebase
2. Use the translation table above
3. Keep it simple and clear
4. Prioritize user understanding over literal translation
