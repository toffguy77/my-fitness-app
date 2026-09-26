-- ============================================================================
-- Миграция 082: справочник нутриентов наполняется, числа уезжают в нормы
-- ============================================================================
--
-- Таблицу nutrient_recommendations создала миграция 009 — и оставила пустой. Ни
-- одной строки не появилось ни на dev, ни на проде (проверено запросом перед
-- этой миграцией), поэтому колонки можно переставить, а не пристроить рядом:
-- переносить нечего.
--
-- Числа уходят в nutrient_norms, потому что норма зависит от человека, а не от
-- нутриента: железа женщине нужно 18 мг, мужчине 10 мг — разница в 1,8 раза.
-- Одно число на нутриент означало бы показать женщине мужскую норму железа.
--
-- Источник — МР 2.3.1.0253-21 «Нормы физиологических потребностей в энергии и
-- пищевых веществах для различных групп населения Российской Федерации»
-- (Роспотребнадзор, 22.07.2021). Строки ниже собраны
-- scripts/nutrient-norms-from-mr.mjs: каждая величина прочитана из таблиц
-- документа и сверена с тем, как та же величина названа в его прозе.

-- 1. Справочник перестаёт хранить числа и начинает хранить происхождение.
ALTER TABLE nutrient_recommendations
    DROP COLUMN IF EXISTS daily_target,
    DROP COLUMN IF EXISTS min_recommendation,
    DROP COLUMN IF EXISTS optimal_recommendation,
    ADD COLUMN IF NOT EXISTS source TEXT,
    ADD COLUMN IF NOT EXISTS source_version TEXT,
    ADD COLUMN IF NOT EXISTS intake_source TEXT;

COMMENT ON COLUMN nutrient_recommendations.source IS 'Откуда взято описание нутриента';
COMMENT ON COLUMN nutrient_recommendations.source_version IS 'Версия источника: документ заменяют, и видно, по какому писали';
COMMENT ON COLUMN nutrient_recommendations.intake_source IS 'Как считается потребление; пусто — не считается вовсе, и тогда ноль показывать нельзя';

ALTER TABLE nutrient_recommendations
    ADD CONSTRAINT nutrient_recommendations_intake_source_check
    CHECK (intake_source IS NULL OR intake_source IN ('calories', 'protein', 'fat', 'carbs', 'fiber', 'sodium'));

-- 2. Нормы: порог «от возраста», а не диапазон.
--
-- Пересечься двум порогам нельзя по построению, применяется наибольший
-- подходящий. Диапазоны потребовали бы исключающего ограничения и расширения
-- btree_gist на управляемой базе.
--
-- sex = 'any' — норма одна для всех взрослых. Отсутствие строки 'any' у
-- нутриента означает, что без пола норму выбрать нельзя, и тогда её не
-- показывают числом вовсе.
CREATE TABLE IF NOT EXISTS nutrient_norms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    nutrient_id UUID NOT NULL REFERENCES nutrient_recommendations(id) ON DELETE CASCADE,

    sex TEXT NOT NULL DEFAULT 'any' CHECK (sex IN ('any', 'male', 'female')),
    min_age INTEGER NOT NULL DEFAULT 18 CHECK (min_age >= 0 AND min_age < 150),

    daily_target NUMERIC(12, 4) NOT NULL CHECK (daily_target > 0),
    min_value NUMERIC(12, 4),
    optimal_value NUMERIC(12, 4),

    source TEXT NOT NULL,
    source_version TEXT NOT NULL,
    note TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (nutrient_id, sex, min_age)
);

CREATE INDEX IF NOT EXISTS idx_nutrient_norms_nutrient ON nutrient_norms(nutrient_id);

COMMENT ON TABLE nutrient_norms IS 'Суточные нормы нутриентов по полу и возрасту';
COMMENT ON COLUMN nutrient_norms.sex IS 'any — норма одна для всех взрослых; male/female — норма зависит от пола';
COMMENT ON COLUMN nutrient_norms.min_age IS 'Норма применяется с этого возраста; берётся наибольший подходящий порог';
COMMENT ON COLUMN nutrient_norms.note IS 'Где в источнике эта величина и чем она объявлена: потребностью или адекватным уровнем';

-- 3. Наполнение.

-- Сгенерировано scripts/nutrient-norms-from-mr.mjs из МР 2.3.1.0253-21.
-- Цифры сверены между таблицами документа и его прозой; см. шапку скрипта.

-- Витамин C: Физиологическая потребность для взрослых – 100 мг/сутки.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Витамин C', 'vitamins', 'mg', false, 'Витамин С (формы и метаболиты аскорбиновой кислоты). Относится к группе неферментных антиоксидантов, активизирует биосинтез кортикоидных гормонов, ответственных за адаптивные реакции организма, обусловливая антистрессорное влияние, тормозит процессы перекисного окисления липидов, с чем связан его мембраностабилизирующий эффект, имеет капилляроукрепляющий эффект, который реализуется путем того, что витамин С существенно влияет на формирование коллагеновых волокон сосудов, кожи, костной ткани и зубов, способствует усвоению железа и нормализует процессы кроветворения, участвует в окислительно-восстановительных реакциях, функционировании иммунной системы.', NULL, 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 100, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 11, 16; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Витамин C';

-- Витамин B1 (тиамин): Физиологическая потребность для взрослых – 1,5 мг/сутки или 0,6 мг/1000 ккал.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Витамин B1 (тиамин)', 'vitamins', 'mg', false, 'Витамин В1 (тиамин). Тиамин в форме образующегося из него тиаминдифосфата входит в состав важнейших ферментов углеводного и энергетического обмена, обеспечивающих организм энергией и пластическими веществами, а также метаболизм разветвленных аминокислот, играет определяющую роль в превращении глюкозы в другие сахара. Тиамин модулирует передачу нервного импульса, регулирует перенос натрия через нейрональную мембрану, оказывает антиоксидантное действие.', 'При дефиците тиамина нарушается метаболизм углеводов, что способствует избыточному накоплению в организме жира, а также ведет к серьезным нарушениям нервной, пищеварительной и сердечнососудистой систем. Потребность в тиамине зависит от потребления углеводов и энергии, поэтому рекомендуемое потребление тиамина соотносят с потреблением энергии.', 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 1.5, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 11, 16; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Витамин B1 (тиамин)';

-- Витамин B2 (рибофлавин): Физиологическая потребность для взрослых – 1,8 мг/сутки или 0,75 мг/1000 ккал.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Витамин B2 (рибофлавин)', 'vitamins', 'mg', false, 'Витамин В2 (рибофлавин). Рибофлавин в форме коферментов участвует в окислительно-восстановительных реакциях, способствует повышению восприимчивости цвета зрительным анализатором и темновой адаптации.', 'Недостаточное потребление витамина В2 сопровождается нарушением состояния кожных покровов, слизистых оболочек, нарушением светового и сумеречного зрения. На рибофлавиновый статус влияет физическая активность, поэтому потребность в этом витамине может быть выражена в расчете на единицу энергетической ценности рациона.', 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 1.8, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 11, 16; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Витамин B2 (рибофлавин)';

-- Витамин B6: Физиологическая потребность для взрослых – 2,0 мг/сутки.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Витамин B6', 'vitamins', 'mg', false, 'Витамин В6 (пиридоксин). Пиридоксин в форме своих коферментов участвует в превращениях аминокислот, метаболизме триптофана, липидов и нуклеиновых кислот, участвует в поддержании иммунного ответа, процессах торможения и возбуждения в центральной нервной системе, способствует нормальному формированию эритроцитов, поддержанию нормального уровня гомоцистеина в крови.', 'Недостаточное потребление витамина В6 сопровождается снижением аппетита, нарушением состояния кожных покровов, развитием гомоцистеинемии, анемии.', 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 2, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 11, 16; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Витамин B6';

-- Ниацин: Физиологическая потребность для взрослых – 20 мг ниац. экв./сутки или 8 мг ниац. экв./1000 ккал.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Ниацин', 'vitamins', 'mg', false, 'Ниацин. В качестве кофермента участвует в окислительновосстановительных реакциях энергетического метаболизма, способствует усвоению растительного белка. Норма в ниациновом эквиваленте.', 'Недостаточное потребление ниацина сопровождается нарушением нормального состояния кожных покровов, желудочно-кишечного тракта и нервной системы. Потребность в ниацине зависит от потребления энергии.', 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 20, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 11, 16; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Ниацин';

-- Витамин B12: Физиологическая потребность для взрослых – 3,0 мкг/сутки.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Витамин B12', 'vitamins', 'mcg', false, 'Витамин В12. Играет важную роль в метаболизме и превращениях аминокислот. Фолат и витамин В12 являются взаимосвязанными витаминами, участвуют в кроветворении.', 'Недостаток витамина В12 приводит к развитию частичной или вторичной недостаточности фолатов, а также анемии, лейкопении, тромбоцитопении.', 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 3, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 11, 16; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Витамин B12';

-- Фолаты: Физиологическая потребность для взрослых – 400 мкг/сутки.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Фолаты', 'vitamins', 'mcg', false, 'Фолаты в качестве кофермента участвуют в метаболизме нуклеиновых и аминокислот.', 'Дефицит фолатов ведет к нарушению синтеза нуклеиновых кислот и белка, следствием чего является торможение роста и деления клеток, особенно в быстро пролиферирующих тканях (клетках): костный мозг, эпителий кишечника и др. Недостаточное потребление фолата во время беременности является одной из причин недоношенности, гипотрофии, врожденных уродств и нарушений развития ребенка. Показана выраженная связь между уровнем фолата, гомоцистеина и риском возникновения сердечнососудистых заболеваний. 1 мкг фолат-эквивалент пищи = 1 мкг фолатов пищи = 0,6 мкг фолиевой кислоты, поступающей из обогащенной пищевой продукции и БАД к пище.', 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 400, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 11, 16; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Фолаты';

-- Пантотеновая кислота: Физиологическая потребность для взрослых – 5 мг/сутки.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Пантотеновая кислота', 'vitamins', 'mg', false, 'Пантотеновая кислота участвует в белковом, жировом, углеводном обмене, обмене холестерина, синтезе ряда гормонов, гемоглобина, способствует всасыванию аминокислот и сахаров в кишечнике, поддерживает функцию коры надпочечников.', 'Недостаток пантотеновой кислоты может вести к поражению кожи и слизистых оболочек.', 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 5, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 11, 16; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Пантотеновая кислота';

-- Биотин: Физиологическая потребность для взрослых – 50 мкг/сутки.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Биотин', 'vitamins', 'mcg', false, 'Биотин участвует в синтезе жиров, гликогена, метаболизме аминокислот.', 'Недостаточное потребление этого витамина может вести к нарушению нормального состояния кожных покровов.', 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 50, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 11, 16; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Биотин';

-- Витамин A: Физиологическая потребность для мужчин – 900 мкг рет. экв./сутки, для женщин 800 мкг рет. экв./сутки.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Витамин A', 'vitamins', 'mcg', false, 'Витамин А играет важную роль в процессах роста и репродукции, дифференцировки эпителиальной и костной ткани, поддержания иммунитета и зрения. Норма в ретиноловом эквиваленте.', 'Дефицит витамина А ведет к нарушению темновой адаптации («куриная слепота» или гемералопия), ороговению кожных покровов, снижает устойчивость к инфекциям.', 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'male', 18, 900, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 11, 16; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Витамин A';
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'female', 18, 800, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 11, 16; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Витамин A';

-- Бета-каротин: Физиологическая потребность для взрослых – 5 мг/сутки.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Бета-каротин', 'vitamins', 'mg', false, 'Бета-каротин является провитамином А и обладает антиоксидантными свойствами; 6 мкг бета-каротина или 12 мкг бета-каротина из пищи эквивалентны 1 мкг витамина А (рет. экв.).', NULL, 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 5, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 11, 16; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Бета-каротин';

-- Витамин E: Физиологическая потребность для взрослых – 15 мг ток. экв./сутки.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Витамин E', 'vitamins', 'mg', false, 'Витамин Е (α-токоферол, а также β-, γ-, δ-токоферолы) является антиоксидантом, универсальным стабилизатором клеточных мембран, необходим для функционирования половых желез, сердечной мышцы. Норма в токофероловом эквиваленте.', 'При дефиците α-токоферола наблюдаются гемолиз эритроцитов, неврологические нарушения. Потребность в витамине Е возрастает с увеличением потребления ПНЖК и степенью их ненасыщенности, составляя 0,4–0,6 мг ток. экв. α-токоферола на каждый 1 г ПНЖК.', 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 15, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 11, 16; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Витамин E';

-- Витамин D: Физиологическая потребность для взрослых – 15 мкг/сутки (600 МЕ), для лиц старше 65 лет – 20 мкг/сутки (800 МЕ).
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Витамин D', 'vitamins', 'mcg', false, 'Витамин D. Основные функции витамина D (эргокальциферол, холекальциферол, 25-гидроксивитамин D3 и др.) связаны с поддержанием гомеостаза кальция и фосфора, осуществлением процессов минерализации костной ткани.', 'Недостаток витамина D приводит к нарушению обмена кальция и фосфора в костях, усилению деминерализации костной ткани, что приводит к увеличению риска развития остеопороза. Сниженные концентрации в сыворотке крови 25(ОН)D ассоциированы с целым рядом внескелетных заболеваний (некоторые виды рака, артериальная гипертезия, возрастное снижение познавательной способности, нарушения функций иммунной и репродуктивной систем и др.) [35—38].', 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 15, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 11, 16; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Витамин D';
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 65, 20, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 11, 16; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Витамин D';

-- Витамин K: Физиологическая потребность для взрослых – 120 мкг/сутки.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Витамин K', 'vitamins', 'mcg', false, 'Витамин К (филлохинон и менахиноны). Метаболическая роль витамина К обусловлена его участием в модификации ряда белков свертывающей системы крови и костной ткани.', 'Недостаток витамина К приводит к увеличению времени свертывания крови, пониженному содержанию протромбина в крови. Адекватное потребление витамина К2 (менахинонов) ассоциировано со сниженным риском сердечно-сосудистых заболеваний.', 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 120, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 11, 16; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Витамин K';

-- Кальций: Физиологическая потребность для взрослых – 1000 мг/сутки, для лиц старше 65 лет – 1200 мг/сутки.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Кальций', 'minerals', 'mg', false, 'Кальций. Необходимый элемент минерального матрикса кости, играет ведущую роль в нервной проводимости и процессе свертывания крови, участвует в мышечном сокращении.', 'Дефицит кальция приводит к деминерализации позвоночника, костей таза и нижних конечностей, повышает риск развития остеопороза.', 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 1000, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 12, 17; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Кальций';
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 65, 1200, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 12, 17; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Кальций';

-- Фосфор: Физиологическая потребность для взрослых – 700 мг/сутки.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Фосфор', 'minerals', 'mg', false, 'Фосфор. В форме фосфатов принимает участие во многих физиологических процессах, включая энергетический обмен (в виде высокоэнергетического АТФ), регуляции кислотно-щелочного баланса, входит в состав фосфолипидов, нуклеотидов и нуклеиновых кислот, участвует в клеточной регуляции путем фосфорилирования ферментов, необходим для минерализации костей и зубов.', 'Дефицит приводит к анорексии, анемии, рахиту. Оптимальное для всасывания и усвоения кальция соотношение содержания кальция к фосфору в рационе составляет 1 : 1.', 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 700, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 12, 17; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Фосфор';

-- Магний: Уточненная физиологическая потребность для взрослых – 420 мг/сутки.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Магний', 'minerals', 'mg', false, 'Магний. Является кофактором многих ферментов углеводнофосфорного и энергетического обменов, участвует в синтезе белков, нуклеиновых кислот, обладает стабилизирующим действием для мембран, необходим для поддержания гомеостаза кальция, калия и натрия [39, 40].', 'Недостаток магния приводит к гипомагниемии, повышению риска развития гипертонии, болезней сердца.', 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 420, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 12, 17; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Магний';

-- Калий: Уточненная физиологическая потребность для взрослых – 3500 мг/сутки.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Калий', 'minerals', 'mg', false, 'Калий. Является главным внутриклеточным электролитом, играющим важную роль в поддержании мембранного потенциала, принимает участие в регуляции водного, кислотного и электролитного баланса, участвует в процессах проведения нервных импульсов, регуляции давления. Пища, богатая калием, вызывает повышенное выделение натрия из организма и, наоборот, повышенное потребление натрия приводит к потере организмом калия. Потребление калия 3500 мг (90 ммоль) в день оказывает благоприятное влияние на артериальное давление у взрослых. Потребление калия менее 3500 мг (90 ммоль) в день связано с повышенным риском развития инсульта и других сердечно-сосудистых заболеваний [41, 42].', NULL, 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 3500, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 12, 17; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Калий';

-- Натрий: Физиологическая потребность для взрослых – 1300 мг/сутки.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Натрий', 'minerals', 'mg', false, 'Натрий. Является главным внеклеточным электролитом, который участвует в обеспечении необходимой буферности крови, регуляции кровяного давления, водного обмена, набухания коллоидов тканей и задержке воды в организме, активации пищеварительных ферментов, в переносе глюкозы крови, генерации и передаче электрических нервных сигналов, мышечном сокращении.', NULL, 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 1300, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 12, 17; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Натрий';

-- Хлориды: Физиологическая потребность для взрослых – 2300 мг/сутки.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Хлориды', 'minerals', 'mg', false, 'Хлориды. Хлор необходим для образования и секреции соляной кислоты.', NULL, 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 2300, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 12, 17; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Хлориды';

-- Железо: Физиологическая потребность для взрослых – 10 мг/сутки (для мужчин) и 18 мг/сутки (для женщин).
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Железо', 'minerals', 'mg', false, 'Железо. Является незаменимой частью гемоглобина и миоглобина, входит в состав цитохромов, каталазы и пероксидазы. Участвует в транспорте электронов, кислорода, обеспечивает протекание окислительно-восстановительных реакций и активацию перекисного окисления. Железо в зависимости от валентности оказывает как антиоксидантное, так и прооксидантное действие.', 'Недостаточное потребление ведет к гипохромной анемии, миоглобиндефицитной атонии скелетных мышц, повышенной утомляемости, миокардиопатии, атрофическому гастриту.', 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'male', 18, 10, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 12, 17; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Железо';
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'female', 18, 18, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 12, 17; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Железо';

-- Цинк: Физиологическая потребность для взрослых – 12 мг/сутки.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Цинк', 'minerals', 'mg', false, 'Цинк. Играет важную роль в обменных процессах, входит в состав многих ферментов, участвует в процессах синтеза и распада углеводов, белков, жиров, нуклеиновых кислот и в регуляции экспрессии генов, влияет на активность гормонов и витаминов.', 'Недостаточное потребление приводит к анемии, вторичному иммунодефициту, циррозу печени, половой дисфункции, наличию пороков развития плода. Выявлена способность высоких доз цинка нарушать усвоение меди и тем способствовать развитию анемии.', 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 12, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 12, 17; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Цинк';

-- Йод: Физиологическая потребность для взрослых – 150 мкг/сутки.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Йод', 'minerals', 'mcg', false, 'Йод. Участвует в функционировании щитовидной железы, обеспечивая образование гормонов (тироксина и трийодтиронина), которые необходимы для роста и дифференцировки клеток всех тканей организма человека, митохондриального дыхания, регуляции трансмембранного транспорта натрия и гормонов. Недостаточное поступление приводит к эндемическому зобу с гипотиреозом и замедлению обмена веществ, артериальной гипотензии, отставанию в росте и умственном развитии у детей.', NULL, 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 150, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 12, 17; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Йод';

-- Медь: Физиологическая потребность для взрослых – 1,0 мг/сутки.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Медь', 'minerals', 'mg', false, 'Медь. Входит в состав ферментов, обладающих окислительновосстановительной активностью и участвующих в метаболизме железа, стимулирует усвоение белков и углеводов. Участвует в процессах обеспечения тканей организма человека кислородом. Является антиоксидантом непрямого действия. Клинические проявления недостаточного потребления проявляются в нарушении формирования сердечно-сосудистой системы и скелета, развитии дисплазии соединительной ткани.', NULL, 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 1, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 12, 17; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Медь';

-- Марганец: Физиологическая потребность для взрослых – 2 мг/сутки.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Марганец', 'minerals', 'mg', false, 'Марганец. Участвует в образовании костной и соединительной тканей, входит в состав ферментов, участвующих в метаболизме аминокислот, углеводов, катехоламинов, необходим для синтеза холестерина и нуклеотидов. Является антиоксидантом непрямого действия.', 'Недостаточное потребление сопровождается замедлением роста, нарушениями в репродуктивной системе, повышенной хрупкостью костной ткани, нарушениями углеводного и липидного обмена.', 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 2, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 12, 17; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Марганец';

-- Молибден: Физиологическая потребность для взрослых – 70 мкг/сутки.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Молибден', 'minerals', 'mcg', false, 'Молибден. Является кофактором многих ферментов, обеспечивающих метаболизм серосодержащих аминокислот, пуринов и пиримидинов.', NULL, 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 70, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 12, 17; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Молибден';

-- Селен: Физиологическая потребность для взрослых – 55 мкг/сутки для женщин, 70 мкг/сутки для мужчин.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Селен', 'minerals', 'mcg', false, 'Селен. Выполняет каталитическую, структурную и регуляторную функции, взаимодействует с витаминами, ферментами и биологическими мембранами, участвует в окислительно-восстановительных процессах, обмене белков, жиров и углеводов. Эссенциальный элемент антиоксидантной системы защиты организма человека, обладает иммуномодулирующим действием и др. Выявлена корреляция между пищевой потребностью в селене и витамине Е, причем при недостаточном поступлении токоферола в организм селен может предотвратить развитие симптомов дефицита витамина Е.', 'Дефицит приводит к болезни Кашина- Бека (остеоартроз с множественной деформацией суставов, позвоночника и конечностей), болезни Кешана (эндемическая миокардиопатия), наследственной тромбастении.', 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'male', 18, 70, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 12, 17; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Селен';
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'female', 18, 55, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 12, 17; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Селен';

-- Хром: Уточненная физиологическая потребность для взрослых – 40 мкг/сутки.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Хром', 'minerals', 'mcg', false, 'Хром. Нормализует проницаемость клеточных мембран для глюкозы, процессы использования ее клетками и депонирования, увеличивает чувствительность рецепторов тканей к инсулину, уменьшая потребность организма в инсулине.', 'Дефицит приводит к снижению толерантности к глюкозе, а также повышению триглицеридов и холестерина. Влияние хрома на липидный обмен опосредуется его регулирующим влиянием на функционирование инсулина.', 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 40, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 12, 17; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Хром';

-- Кобальт: Адекватный уровень потребления для взрослых 10 мкг/сутки.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Кобальт', 'minerals', 'mcg', false, 'Кобальт. Входит в состав витамина В12. Активирует ферменты обмена жирных кислот и метаболизма фолиевой кислоты.', NULL, 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 10, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 13, 18; адекватный уровень потребления'
FROM nutrient_recommendations WHERE name = 'Кобальт';

-- Фтор: Адекватный уровень потребления для взрослых – 4 мг/сутки.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Фтор', 'minerals', 'mg', false, 'Фтор. Инициирует минерализацию костей.', 'Недостаточное потребление приводит к кариесу, преждевременному стиранию эмали зубов.', 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 4, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 13, 18; адекватный уровень потребления'
FROM nutrient_recommendations WHERE name = 'Фтор';

-- Кремний: Адекватный уровень потребления для взрослых 30 мг/сутки.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Кремний', 'minerals', 'mg', false, 'Кремний. Входит в качестве структурного компонента в состав глюкозоаминогликанов и стимулирует синтез коллагена.', NULL, 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 30, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 13, 18; адекватный уровень потребления'
FROM nutrient_recommendations WHERE name = 'Кремний';

-- Ванадий: Адекватный уровень потребления для взрослых 15 мкг/сутки.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Ванадий', 'minerals', 'mcg', false, 'Ванадий. Одна из предполагаемых функций ванадия – это активизация деятельности фагоцитов. Ванадий препятствует накоплению холестерина, развитию атеросклероза, участвует в регуляции уровня сахара в крови, обмене кальция.', NULL, 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 15, NULL, NULL, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 13, 18; адекватный уровень потребления'
FROM nutrient_recommendations WHERE name = 'Ванадий';

-- Пищевые волокна: Физиологическая потребность в пищевых волокнах для взрослого человека составляет 20—25 г/сутки или 10 г/1000 ккал, для детей старше 1 года – 10–22 г/сутки.
INSERT INTO nutrient_recommendations (name, category, unit, is_weekly, description, effects, source, source_version)
VALUES ('Пищевые волокна', 'fiber', 'g', false, 'Пищевые волокна – съедобные части растений или аналогичные углеводы, устойчивые к перевариванию и адсорбции в тонком кишечнике человека, полностью или частично ферментируемые в толстом кишечнике (полисахариды, олигосахариды, лигнин и ассоциированные растительные вещества). Пищевые волокна относятся к некрахмальным полисахаридам, которые перевариваются в толстом кишечнике в незначительной степени, однако при этом оказывают существенное влияние на процессы переваривания, усвоения, микробиоциноз и эвакуацию остатков пищи. Эффекты физиологического воздействия пищевых волокон зависят от их растворимости в воде. Растворимые пищевые волокна (пектин, альгинаты, полидекстроза и др.) способны оказывать опосредованное влияние на метаболизм холестерина и липидов (липопротеины низкой плотности и триглицериды), на гликемическую нагрузку пищи, уровень глюкозы и инсулина, проявлять пребиотическое действие, связывать и выводить тяжелые металлы. Нерастворимые волокна (целлюлоза, гемицеллюлоза, лигнин) выполняют функции энтеросорбента, участвуют в механизме предупреждения кариеса.', NULL, 'МР 2.3.1.0253-21', '2021-07-22');
INSERT INTO nutrient_norms (nutrient_id, sex, min_age, daily_target, min_value, optimal_value, source, source_version, note)
SELECT id, 'any', 18, 20, 20, 25, 'МР 2.3.1.0253-21', '2021-07-22', 'табл. 10, 14; п. 4.2.1; физиологическая потребность'
FROM nutrient_recommendations WHERE name = 'Пищевые волокна';
-- 4. Теперь, когда у каждой строки есть источник, его отсутствие запрещено.
ALTER TABLE nutrient_recommendations
    ALTER COLUMN source SET NOT NULL,
    ALTER COLUMN source_version SET NOT NULL;
