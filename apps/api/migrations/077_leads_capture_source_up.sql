-- Migration: Lead capture source
-- Version: 077
--
-- Контакт теперь берётся в трёх местах: шаг контакта в мастере, экран
-- результата и разговор с ботом. Без отметки источника сравнить их между собой
-- нельзя, а поле source уже занято — оно про то, откуда человек пришёл на сайт.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS capture_source TEXT;
COMMENT ON COLUMN leads.capture_source IS 'Где оставлен контакт: contact_step | result | bot';
