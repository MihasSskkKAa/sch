/**
 * Общий рейтинг: обмен результатами с Supabase через REST API.
 *
 * Никаких библиотек не подключаем — обычный fetch к эндпоинту PostgREST,
 * поэтому игра остаётся набором статических файлов без сборки.
 * Все ошибки сети обрабатываются здесь: игра не должна ломаться из-за того,
 * что интернет пропал или проект недоступен.
 */
const LEADERBOARD = (function () {
  'use strict';

  var ТАБЛИЦА = 'records';
  var ЛИМИТ = 20;

  function настроен() {
    return Boolean(typeof SUPABASE !== 'undefined' && SUPABASE.url && SUPABASE.anonKey);
  }

  /** Терпим и адрес проекта, и адрес, в который уже вписан путь /rest/v1. */
  function адрес(путь) {
    var база = String(SUPABASE.url).replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
    return база + '/rest/v1/' + путь;
  }

  function заголовки(доп) {
    var h = {
      apikey: SUPABASE.anonKey,
      Authorization: 'Bearer ' + SUPABASE.anonKey,
      'Content-Type': 'application/json'
    };
    if (доп) Object.keys(доп).forEach(function (k) { h[k] = доп[k]; });
    return h;
  }

  /**
   * Отправляет результат в общий рейтинг.
   * Возвращает промис с true/false — вызывающий код не должен падать на отказе.
   */
  function отправить(запись) {
    if (!настроен()) return Promise.resolve(false);

    return fetch(адрес(ТАБЛИЦА), {
      method: 'POST',
      headers: заголовки({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        player: запись.имя,
        level: запись.уровень,
        level_title: запись.название,
        score: запись.очки,
        stars: запись.звёзды,
        duration_ms: запись.время
      })
    })
      .then(function (r) { return r.ok; })
      .catch(function () { return false; });
  }

  /** Загружает верхушку общего рейтинга и приводит её к формату локальных записей. */
  function загрузить() {
    if (!настроен()) return Promise.reject(new Error('Общий рейтинг не настроен'));

    var путь = ТАБЛИЦА +
      '?select=player,level,level_title,score,stars,duration_ms,created_at' +
      '&order=score.desc&limit=' + ЛИМИТ;

    return fetch(адрес(путь), { headers: заголовки() })
      .then(function (r) {
        if (!r.ok) throw new Error('Сервер ответил ' + r.status);
        return r.json();
      })
      .then(function (rows) {
        return rows.map(function (row) {
          return {
            имя: row.player,
            уровень: row.level,
            название: row.level_title,
            очки: row.score,
            звёзды: row.stars,
            время: row.duration_ms,
            дата: row.created_at
          };
        });
      });
  }

  return { настроен: настроен, отправить: отправить, загрузить: загрузить };
})();
