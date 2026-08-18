/**
 * Школьный квест — игровая логика.
 * Прогресс хранится в localStorage, поэтому уровни остаются открытыми
 * после закрытия вкладки.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'school-quest-progress';
  var LIVES_PER_LEVEL = 3;

  /** Текущая партия. Заполняется при старте уровня. */
  var state = {
    level: null,      // объект уровня из LEVELS
    questions: [],    // перемешанная копия вопросов
    index: 0,         // номер текущего вопроса
    correct: 0,       // сколько верных ответов
    lives: LIVES_PER_LEVEL,
    score: 0,
    timeLeft: 0,
    timerId: null,
    locked: false     // true, пока показывается разбор ответа
  };

  /* ================= Прогресс ================= */

  function loadProgress() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveProgress(progress) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch (e) {
      /* приватный режим браузера — играем без сохранения */
    }
  }

  function isUnlocked(levelId) {
    if (levelId === LEVELS[0].id) return true;
    var progress = loadProgress();
    var prev = progress[levelId - 1];
    return Boolean(prev && prev.passed);
  }

  /* ================= Утилиты ================= */

  function $(id) { return document.getElementById(id); }

  function shuffle(list) {
    var copy = list.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  /** Перемешивает вопросы и варианты ответов, сохраняя указатель на верный. */
  function prepareQuestions(level) {
    return shuffle(level.questions).map(function (q) {
      var pairs = q.options.map(function (text, i) {
        return { text: text, isCorrect: i === q.correct };
      });
      var mixed = shuffle(pairs);
      return {
        subject: q.subject,
        text: q.text,
        fact: q.fact,
        options: mixed.map(function (p) { return p.text; }),
        correct: mixed.findIndex(function (p) { return p.isCorrect; })
      };
    });
  }

  function showScreen(id) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) {
      screens[i].classList.toggle('is-active', screens[i].id === id);
    }
    window.scrollTo(0, 0);
  }

  function starsRow(count, total) {
    var out = '';
    for (var i = 0; i < total; i++) {
      out += i < count ? '<span>⭐</span>' : '<span class="star-off">⭐</span>';
    }
    return out;
  }

  /* ================= Меню ================= */

  function renderMenu() {
    var progress = loadProgress();
    var grid = $('level-grid');
    var totalScore = 0;
    var totalStars = 0;
    var done = 0;

    grid.innerHTML = '';

    LEVELS.forEach(function (level) {
      var saved = progress[level.id];
      var unlocked = isUnlocked(level.id);

      if (saved && saved.passed) {
        totalScore += saved.score || 0;
        totalStars += saved.stars || 0;
        done++;
      }

      var btn = document.createElement('button');
      btn.className = 'level' + (unlocked ? '' : ' is-locked');
      btn.disabled = !unlocked;

      var starsHtml = saved && saved.passed
        ? '<div class="level-stars">' + starsRow(saved.stars, 3) +
          ' <span style="color:var(--muted);letter-spacing:0">· ' + saved.score + ' очков</span></div>'
        : '';

      btn.innerHTML =
        '<span class="level-icon">' + level.icon + '</span>' +
        '<span class="level-body">' +
          '<span class="level-title">Уровень ' + level.id + ' — ' + level.title + '</span>' +
          '<span class="level-sub">' + level.subtitle + ' · ' + level.questions.length +
            ' вопросов · ' + level.time + ' сек на ответ</span>' +
          starsHtml +
        '</span>' +
        (unlocked ? '' : '<span class="level-lock">🔒</span>');

      if (unlocked) {
        btn.addEventListener('click', function () { startLevel(level.id); });
      }
      grid.appendChild(btn);
    });

    $('total-score').textContent = totalScore;
    $('total-stars').textContent = totalStars;
    $('levels-done').textContent = done + ' / ' + LEVELS.length;
  }

  /* ================= Игра ================= */

  function startLevel(levelId) {
    var level = LEVELS.filter(function (l) { return l.id === levelId; })[0];
    if (!level) return;

    state.level = level;
    state.questions = prepareQuestions(level);
    state.index = 0;
    state.correct = 0;
    state.lives = LIVES_PER_LEVEL;
    state.score = 0;

    $('game-level-name').textContent = 'Уровень ' + level.id + ' — ' + level.title;

    showScreen('screen-game');
    renderQuestion();
  }

  function renderLives() {
    var out = '';
    for (var i = 0; i < LIVES_PER_LEVEL; i++) {
      out += i < state.lives ? '<span>❤️</span>' : '<span class="heart-lost">❤️</span>';
    }
    $('lives').innerHTML = out;
  }

  function renderQuestion() {
    var q = state.questions[state.index];
    var total = state.questions.length;

    state.locked = false;
    $('feedback').hidden = true;

    $('q-counter').textContent = 'Вопрос ' + (state.index + 1) + ' из ' + total;
    $('progress-fill').style.width = (state.index / total * 100) + '%';
    $('subject-tag').textContent = q.subject;
    $('question-text').textContent = q.text;
    renderLives();

    var box = $('options');
    box.innerHTML = '';
    q.options.forEach(function (text, i) {
      var btn = document.createElement('button');
      btn.className = 'option';
      btn.innerHTML = '<span class="option-key">' + (i + 1) + '</span><span>' + text + '</span>';
      btn.addEventListener('click', function () { answer(i); });
      box.appendChild(btn);
    });

    startTimer();
  }

  function startTimer() {
    stopTimer();
    state.timeLeft = state.level.time;
    updateTimer();

    state.timerId = setInterval(function () {
      state.timeLeft--;
      updateTimer();
      if (state.timeLeft <= 0) {
        stopTimer();
        answer(-1); // время вышло — засчитываем как неверный ответ
      }
    }, 1000);
  }

  function stopTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function updateTimer() {
    var share = state.timeLeft / state.level.time;
    var fill = $('timer-fill');
    fill.style.width = (share * 100) + '%';
    fill.className = 'timer-fill' + (share <= 0.2 ? ' is-critical' : share <= 0.5 ? ' is-low' : '');
    $('timer-value').textContent = state.timeLeft;
  }

  function answer(pickedIndex) {
    if (state.locked) return;
    state.locked = true;
    stopTimer();

    var q = state.questions[state.index];
    var isRight = pickedIndex === q.correct;
    var timedOut = pickedIndex === -1;

    var buttons = $('options').querySelectorAll('.option');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].disabled = true;
      if (i === q.correct) buttons[i].classList.add('is-correct');
      if (i === pickedIndex && !isRight) buttons[i].classList.add('is-wrong');
    }

    if (isRight) {
      state.correct++;
      state.score += 100 * state.level.id + state.timeLeft * 5;
    } else {
      state.lives--;
    }
    renderLives();

    var feedback = $('feedback');
    feedback.className = 'feedback ' + (isRight ? 'is-ok' : 'is-bad');
    $('feedback-head').textContent = isRight
      ? 'Верно! +' + (100 * state.level.id + state.timeLeft * 5) + ' очков'
      : timedOut ? 'Время вышло' : 'Неверно';
    $('feedback-fact').textContent = q.fact;

    var isLast = state.index === state.questions.length - 1;
    $('btn-next').textContent = state.lives <= 0 ? 'Итоги →' : isLast ? 'Завершить уровень →' : 'Дальше →';
    feedback.hidden = false;
    $('btn-next').focus();
  }

  function nextQuestion() {
    if (state.lives <= 0) return finishLevel(false);
    if (state.index >= state.questions.length - 1) return finishLevel(true);
    state.index++;
    renderQuestion();
  }

  /* ================= Итоги ================= */

  function finishLevel(passed) {
    stopTimer();

    var total = state.questions.length;
    var stars = 0;
    if (passed) {
      stars = state.correct === total ? 3 : state.correct >= total - 1 ? 2 : 1;
    }

    if (passed) {
      var progress = loadProgress();
      var prev = progress[state.level.id];
      progress[state.level.id] = {
        passed: true,
        stars: Math.max(stars, prev && prev.stars ? prev.stars : 0),
        score: Math.max(state.score, prev && prev.score ? prev.score : 0)
      };
      saveProgress(progress);
    }

    var isLastLevel = state.level.id === LEVELS[LEVELS.length - 1].id;

    $('result-icon').textContent = !passed ? '💔' : isLastLevel ? '🏆' : stars === 3 ? '🌟' : '🎉';
    $('result-title').textContent = !passed
      ? 'Уровень не пройден'
      : isLastLevel ? 'Все уровни пройдены!' : 'Уровень пройден!';
    $('result-stars').innerHTML = starsRow(stars, 3);
    $('res-correct').textContent = state.correct + ' / ' + total;
    $('res-score').textContent = passed ? state.score : 0;

    $('result-text').textContent = !passed
      ? 'Закончились жизни. Разбор ответов ты уже видел — попробуй ещё раз, теперь будет легче.'
      : isLastLevel
        ? 'Ты прошёл всю игру и ответил на вопросы по всем школьным предметам. Можно вернуться и выбить три звезды везде.'
        : stars === 3
          ? 'Идеально — ни одной ошибки. Следующий уровень открыт.'
          : 'Следующий уровень открыт. Пройди заново без ошибок, чтобы получить три звезды.';

    $('btn-continue').hidden = !passed || isLastLevel;
    showScreen('screen-result');
  }

  /* ================= События ================= */

  $('btn-next').addEventListener('click', nextQuestion);

  $('btn-quit').addEventListener('click', function () {
    stopTimer();
    renderMenu();
    showScreen('screen-menu');
  });

  $('btn-retry').addEventListener('click', function () {
    startLevel(state.level.id);
  });

  $('btn-continue').addEventListener('click', function () {
    startLevel(state.level.id + 1);
  });

  $('btn-menu').addEventListener('click', function () {
    renderMenu();
    showScreen('screen-menu');
  });

  $('btn-reset').addEventListener('click', function () {
    if (!confirm('Сбросить весь прогресс? Открытые уровни и очки будут удалены.')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* нечего чистить */ }
    renderMenu();
  });

  /* Клавиатура: 1–4 — выбор ответа, Enter/пробел — дальше. */
  document.addEventListener('keydown', function (e) {
    if (!$('screen-game').classList.contains('is-active')) return;

    if (!state.locked && e.key >= '1' && e.key <= '4') {
      var idx = Number(e.key) - 1;
      var btns = $('options').querySelectorAll('.option');
      if (btns[idx]) btns[idx].click();
      return;
    }

    if (state.locked && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      nextQuestion();
    }
  });

  /* ================= Старт ================= */

  renderMenu();
})();
