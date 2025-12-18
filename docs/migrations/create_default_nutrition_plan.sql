-- Создание плана питания по умолчанию для всех premium пользователей
-- Тренировочный день: 2100 ккал / 100г белка / 40г жиров / 500г углеводов
-- День отдыха: 1800 ккал / 100г белка / 30г жиров / 400г углеводов

-- Находим всех premium пользователей (active subscription)
DO $$
DECLARE
    premium_user RECORD;
    training_target_id UUID;
    rest_target_id UUID;
BEGIN
    -- Проходим по всем premium пользователям
    FOR premium_user IN 
        SELECT id, email 
        FROM profiles 
        WHERE subscription_status = 'active' 
        AND subscription_tier = 'premium'
    LOOP
        -- Проверяем, есть ли уже цели для этого пользователя
        IF NOT EXISTS (
            SELECT 1 FROM nutrition_targets 
            WHERE user_id = premium_user.id 
            AND is_active = true
        ) THEN
            -- Создаем цели для тренировочного дня
            INSERT INTO nutrition_targets (
                user_id,
                day_type,
                calories,
                protein,
                fats,
                carbs,
                is_active
            ) VALUES (
                premium_user.id,
                'training',
                2100,
                100,
                40,
                500,
                true
            ) RETURNING id INTO training_target_id;

            -- Создаем цели для дня отдыха
            INSERT INTO nutrition_targets (
                user_id,
                day_type,
                calories,
                protein,
                fats,
                carbs,
                is_active
            ) VALUES (
                premium_user.id,
                'rest',
                1800,
                100,
                30,
                400,
                true
            ) RETURNING id INTO rest_target_id;

            RAISE NOTICE 'Создан план питания для пользователя % (training: %, rest: %)', 
                premium_user.email, training_target_id, rest_target_id;
        ELSE
            RAISE NOTICE 'План питания уже существует для пользователя %', premium_user.email;
        END IF;
    END LOOP;
END $$;

-- Проверяем результат
SELECT 
    p.email,
    p.subscription_status,
    p.subscription_tier,
    COUNT(nt.id) as targets_count,
    STRING_AGG(nt.day_type || ': ' || nt.calories || ' ккал', ', ') as targets
FROM profiles p
LEFT JOIN nutrition_targets nt ON nt.user_id = p.id AND nt.is_active = true
WHERE p.subscription_status = 'active' AND p.subscription_tier = 'premium'
GROUP BY p.id, p.email, p.subscription_status, p.subscription_tier
ORDER BY p.email;

