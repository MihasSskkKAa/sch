/**
 * Настройки общего рейтинга (Supabase).
 *
 * Пока поля пустые, игра работает как раньше — только с локальной таблицей
 * рекордов. Значения берутся из панели Supabase:
 *   Project Settings → Data API → Project URL и публичный ключ.
 *
 * В url нужен адрес проекта без пути: хвост /rest/v1 код добавляет сам.
 * Публичный ключ (anon или sb_publishable_…) предназначен для кода клиента:
 * доступ ограничивают политики Row Level Security на стороне базы, а не
 * секретность ключа. Секретный ключ (sb_secret_…) сюда класть нельзя.
 * Инструкция по настройке таблицы — в README, раздел «Общий рейтинг».
 */
const SUPABASE = {
  url: 'https://vjqbqxhbhgwtalcoudgp.supabase.co',
  anonKey: 'sb_publishable_n2CbFi0BXsRkCHylqmL5vQ_D8db4URc'
};
