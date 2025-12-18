#!/bin/bash
# Скрипт проверки соответствия миграций формату v{Major}.{Minor}_{description}.sql
# Использование: ./check_migrations_format.sh

echo "🔍 Проверка формата именования миграций..."
echo ""

MIGRATIONS_DIR="$(dirname "$0")"
ERRORS=0

# Паттерн для правильного формата: v{число}.{число}_{описание}.sql или v{число}.{число}.{число}_{описание}.sql
# Поддерживает форматы: v3.2_description.sql и v2.5.1_description.sql
CORRECT_PATTERN="^v[0-9]+(\.[0-9]+)+_[a-z0-9_]+\.sql$"

# Файлы, которые не являются миграциями (исключения)
EXCLUDED_FILES=(
    "setup_database_from_scratch.sql"
    "create_default_nutrition_plan.sql"
    "create_test_users.sql"
    "create_test_users_v2.sql"
    "create_test_users_v3.sql"
)

# Находим все SQL файлы
for file in "$MIGRATIONS_DIR"/*.sql; do
    if [ ! -f "$file" ]; then
        continue
    fi
    
    filename=$(basename "$file")
    
    # Пропускаем исключенные файлы
    skip=false
    for excluded in "${EXCLUDED_FILES[@]}"; do
        if [ "$filename" == "$excluded" ]; then
            skip=true
            break
        fi
    done
    
    if [ "$skip" == true ]; then
        echo "⏭️  Пропущен (утилита): $filename"
        continue
    fi
    
    # Проверяем формат
    if [[ "$filename" =~ $CORRECT_PATTERN ]]; then
        echo "✅ Правильный формат: $filename"
    else
        echo "❌ Неправильный формат: $filename"
        echo "   Ожидается формат: v{Major}.{Minor}_{description}.sql"
        echo "   Пример: v3.2_add_feedback_loop.sql"
        ERRORS=$((ERRORS + 1))
    fi
done

echo ""
if [ $ERRORS -eq 0 ]; then
    echo "✅ Все миграции соответствуют формату!"
    exit 0
else
    echo "❌ Найдено $ERRORS миграций с неправильным форматом"
    echo ""
    echo "📝 Инструкция по переименованию:"
    echo "   1. Переименуйте файл в формат: v{Major}.{Minor}_{description}.sql"
    echo "   2. Обновите заголовок миграции внутри файла"
    echo "   3. Обновите зависимости в других миграциях"
    echo "   4. Обновите README.md с новым именем"
    exit 1
fi

