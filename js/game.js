/**
 * Школьный квест — игровая логика.
 * Прогресс хранится в localStorage, поэтому уровни остаются открытыми
 * после закрытия вкладки.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'school-quest-progress';
  var SOUND_KEY = 'school-quest-sound';
  var RETRY_KEY = 'school-quest-retry';
  var RECORDS_KEY = 'school-quest-records';
  var PLAYER_KEY = 'school-quest-player';
  var MAX_RECORDS = 15;
  var LIVES_PER_LEVEL = 3;
  var HINTS_PER_LEVEL = 3;
  var QUESTIONS_PER_ROUND = 8;

  /** Текущая партия. Заполняется при старте уровня. */
  var state = {
    level: null,      // объект уровня из LEVELS
    questions: [],    // выборка вопросов на эту партию
    index: 0,         // номер текущего вопроса
    correct: 0,       // сколько верных ответов
    lives: LIVES_PER_LEVEL,
    hintsLeft: HINTS_PER_LEVEL,
    hintUsed: false,  // взята ли подсказка на текущем вопросе
    score: 0,
    timeLeft: 0,
    timerId: null,
    startedAt: 0,     // отметка старта уровня для общего секундомера
    runMs: 0,         // сколько заняло прохождение целиком
    runTimerId: null,
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

  /**
   * Вопросы проваленных попыток: id уровня → тексты вопросов той партии.
   * Хранятся рядом с прогрессом, поэтому переживают перезагрузку страницы.
   */
  function loadRetryPool() {
    try {
      var raw = localStorage.getItem(RETRY_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveRetryPool(pool) {
    try {
      localStorage.setItem(RETRY_KEY, JSON.stringify(pool));
    } catch (e) {
      /* приватный режим браузера — тогда набор действует только до перезагрузки */
    }
  }

  /* ================= Рекорды ================= */

  /**
   * Таблица рекордов целиком локальная: сервера у игры нет, поэтому результаты
   * лежат в браузере игрока и никуда не отправляются.
   */
  /**
   * Порядок и длину таблицы задаём при чтении, а не только при записи:
   * в хранилище могут оказаться данные от старой версии или правленые вручную.
   */
  function нормализовать(list) {
    return list
      .filter(function (r) { return r && typeof r.очки === 'number'; })
      .sort(function (a, b) { return b.очки - a.очки; })
      .slice(0, MAX_RECORDS);
  }

  function loadRecords() {
    try {
      var raw = localStorage.getItem(RECORDS_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? нормализовать(list) : [];
    } catch (e) {
      return [];
    }
  }

  function saveRecords(list) {
    try {
      localStorage.setItem(RECORDS_KEY, JSON.stringify(list));
    } catch (e) {
      /* приватный режим — таблица проживёт до перезагрузки */
    }
  }

  /** Миллисекунды → «мм:сс», а после часа → «ч:мм:сс». */
  function форматВремени(ms) {
    var всего = Math.max(0, Math.round(ms / 1000));
    var часы = Math.floor(всего / 3600);
    var минуты = Math.floor((всего % 3600) / 60);
    var секунды = всего % 60;
    function дв(n) { return n < 10 ? '0' + n : String(n); }
    return часы > 0
      ? часы + ':' + дв(минуты) + ':' + дв(секунды)
      : дв(минуты) + ':' + дв(секунды);
  }

  function loadPlayerName() {
    try {
      return localStorage.getItem(PLAYER_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function savePlayerName(name) {
    try { localStorage.setItem(PLAYER_KEY, name); } catch (e) { /* без сохранения */ }
  }

  /** id последнего добавленного результата — чтобы подсветить его в таблице. */
  var свежийРекорд = null;

  function addRecord(level, score, stars, runMs) {
    var list = loadRecords();

    свежийРекорд = String(Date.now()) + '-' + Math.random().toString(36).slice(2, 7);
    list.push({
      id: свежийРекорд,
      имя: loadPlayerName() || 'Игрок',
      уровень: level.id,
      название: level.title,
      очки: score,
      звёзды: stars,
      время: runMs,
      дата: new Date().toISOString()
    });

    saveRecords(нормализовать(list));
  }

  function форматДаты(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    function дв(n) { return n < 10 ? '0' + n : String(n); }
    return дв(d.getDate()) + '.' + дв(d.getMonth() + 1) + '.' + d.getFullYear();
  }

  function renderRecords() {
    var list = loadRecords();
    var body = $('records-body');

    $('player-name').value = loadPlayerName();
    $('player-name-menu').value = loadPlayerName();
    $('records-empty').hidden = list.length > 0;
    $('records-wrap').hidden = list.length === 0; // без строк шапка таблицы не нужна
    body.innerHTML = '';

    list.forEach(function (r, i) {
      var tr = document.createElement('tr');
      if (r.id === свежийРекорд) tr.className = 'is-new';
      tr.innerHTML =
        '<td class="rec-place">' + (i + 1) + '</td>' +
        '<td>' + экранировать(r.имя) + '</td>' +
        '<td>' + r.уровень + ' — ' + экранировать(r.название) + '</td>' +
        '<td class="rec-stars">' + starsRow(r.звёзды, 3) + '</td>' +
        '<td class="rec-score">' + r.очки + '</td>' +
        /* У записей, сделанных до появления секундомера, времени нет. */
        '<td class="rec-time">' + (typeof r.время === 'number' ? форматВремени(r.время) : '—') + '</td>' +
        '<td class="rec-date">' + форматДаты(r.дата) + '</td>';
      body.appendChild(tr);
    });
  }

  /** Имя игрока попадает в разметку, поэтому обезвреживаем угловые скобки. */
  function экранировать(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isUnlocked(levelId) {
    if (levelId === LEVELS[0].id) return true;
    var progress = loadProgress();
    var prev = progress[levelId - 1];
    return Boolean(prev && prev.passed);
  }

  /* ================= Звук ================= */

  /**
   * Звук синтезируется через Web Audio API, поэтому в репозитории нет
   * ни одного аудиофайла и игра одинаково работает с диска и с сервера.
   */
  var audioCtx = null;
  var soundOn = true;

  try {
    soundOn = localStorage.getItem(SOUND_KEY) !== 'off';
  } catch (e) {
    /* приватный режим — просто оставляем звук включённым */
  }

  /** Контекст создаётся лениво: браузеры разрешают звук только после действия игрока. */
  function getAudio() {
    if (!soundOn) return null;
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    if (!audioCtx) audioCtx = new Ctor();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  /** Одна нота с мягким нарастанием и затуханием. */
  function playTone(ctx, freq, delay, duration, type, peak) {
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    var start = ctx.currentTime + delay;

    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  /** Короткое восходящее трезвучие на верный ответ. */
  function playCorrectSound() {
    var ctx = getAudio();
    if (!ctx) return;

    [784, 988, 1319].forEach(function (freq, i) { // соль — си — ми
      playTone(ctx, freq, i * 0.09, 0.3, 'triangle', 0.16);
    });
  }

  /**
   * Нисходящий сигнал на неверный ответ.
   * Тембр треугольный, а не синусоидальный: у чистой синусоиды нет обертонов,
   * и на низких частотах она слышится заметно тише при той же амплитуде.
   */
  function playWrongSound() {
    var ctx = getAudio();
    if (!ctx) return;

    playTone(ctx, 330, 0, 0.26, 'triangle', 0.34);    // ми первой октавы
    playTone(ctx, 220, 0.12, 0.4, 'triangle', 0.34);  // ля ниже — падение вниз
  }

  function renderSoundButton() {
    var btn = $('btn-sound');
    btn.textContent = soundOn ? '🔊' : '🔇';
    btn.classList.toggle('is-muted', !soundOn);
    btn.title = soundOn ? 'Выключить звук' : 'Включить звук';
  }

  function toggleSound() {
    soundOn = !soundOn;
    try { localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off'); } catch (e) { /* без сохранения */ }
    renderSoundButton();
    if (soundOn) playCorrectSound(); // сразу показываем, как это звучит
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

  /**
   * Собирает набор вопросов на партию.
   *
   * Отложенные вопросы копятся: каждый провал добавляет свою партию к прошлым,
   * поэтому подряд идущие попытки не пересекаются, пока в банке хватает свежих.
   * Когда банк исчерпан, начинается новый круг — придерживаем только последнюю
   * партию, чтобы её вопросы не повторились сразу же.
   */
  function pickQuestions(level) {
    var pool = loadRetryPool();
    var отложенные = pool[level.id] || [];
    var свежие = level.questions.filter(function (q) { return отложенные.indexOf(q.text) < 0; });

    if (свежие.length < QUESTIONS_PER_ROUND) {
      отложенные = отложенные.slice(-QUESTIONS_PER_ROUND);
      pool[level.id] = отложенные;
      saveRetryPool(pool);
      свежие = level.questions.filter(function (q) { return отложенные.indexOf(q.text) < 0; });
    }

    /* Банк уровня меньше партии — играем всем, что есть. */
    if (свежие.length < QUESTIONS_PER_ROUND) свежие = level.questions.slice();

    return shuffle(свежие).slice(0, QUESTIONS_PER_ROUND);
  }

  /**
   * Берёт выборку вопросов уровня и перемешивает варианты ответов,
   * сохраняя указатель на верный.
   */
  function prepareQuestions(level) {
    return pickQuestions(level).map(function (q) {
      var pairs = q.options.map(function (text, i) {
        return { text: text, isCorrect: i === q.correct };
      });
      var mixed = shuffle(pairs);
      return {
        subject: q.subject,
        text: q.text,
        hint: q.hint,
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
          '<span class="level-sub">' + level.subtitle + ' · ' + QUESTIONS_PER_ROUND +
            ' вопросов из ' + level.questions.length + ' · ' + level.time + ' сек на ответ</span>' +
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
    state.hintsLeft = HINTS_PER_LEVEL;
    state.score = 0;
    state.startedAt = Date.now();
    state.runMs = 0;

    $('game-level-name').textContent = 'Уровень ' + level.id + ' — ' + level.title;

    showScreen('screen-game');
    startRunClock();
    renderQuestion();
  }

  function renderLives() {
    var out = '';
    for (var i = 0; i < LIVES_PER_LEVEL; i++) {
      out += i < state.lives ? '<span>❤️</span>' : '<span class="heart-lost">❤️</span>';
    }
    $('lives').innerHTML = out;
  }

  /** Прячет текст подсказки и обновляет кнопку под остаток подсказок. */
  function renderHintControls() {
    var btn = $('btn-hint');
    $('hint-text').hidden = true;
    $('hint-count').textContent = state.hintsLeft;
    btn.disabled = state.hintsLeft <= 0 || state.hintUsed || state.locked;
  }

  /** Открывает подсказку к текущему вопросу ценой половины очков за него. */
  function useHint() {
    if (state.locked || state.hintUsed || state.hintsLeft <= 0) return;

    state.hintUsed = true;
    state.hintsLeft--;

    var box = $('hint-text');
    box.textContent = state.questions[state.index].hint;
    box.hidden = false;

    $('hint-count').textContent = state.hintsLeft;
    $('btn-hint').disabled = true;
  }

  /** Очки за верный ответ: подсказка уменьшает награду вдвое. */
  function rewardForAnswer() {
    var base = 100 * state.level.id + state.timeLeft * 5;
    return state.hintUsed ? Math.round(base / 2) : base;
  }

  function renderQuestion() {
    var q = state.questions[state.index];
    var total = state.questions.length;

    state.locked = false;
    state.hintUsed = false;
    $('feedback').hidden = true;
    renderHintControls();

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

  /**
   * Общий секундомер уровня. В отличие от таймера вопроса он не
   * останавливается на разборе ответа — считается всё время прохождения.
   */
  function startRunClock() {
    stopRunClock();
    updateRunClock();
    state.runTimerId = setInterval(updateRunClock, 1000);
  }

  function stopRunClock() {
    if (state.runTimerId) {
      clearInterval(state.runTimerId);
      state.runTimerId = null;
    }
  }

  function updateRunClock() {
    $('run-time').textContent = форматВремени(Date.now() - state.startedAt);
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

    var reward = rewardForAnswer();
    if (isRight) {
      state.correct++;
      state.score += reward;
      playCorrectSound();
    } else {
      state.lives--;
      playWrongSound(); // истёкшее время сюда тоже попадает — оно считается ошибкой
    }
    renderLives();
    $('btn-hint').disabled = true;

    var feedback = $('feedback');
    feedback.className = 'feedback ' + (isRight ? 'is-ok' : 'is-bad');
    $('feedback-head').textContent = isRight
      ? 'Верно! +' + reward + ' очков' + (state.hintUsed ? ' (с подсказкой)' : '')
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
    stopRunClock();
    state.runMs = Date.now() - state.startedAt;

    var total = state.questions.length;
    var stars = 0;
    if (passed) {
      stars = state.correct === total ? 3 : state.correct >= total - 1 ? 2 : 1;
    }

    /* Провал — добавляем эти вопросы к отложенным, победа — очищает список. */
    var pool = loadRetryPool();
    if (passed) {
      delete pool[state.level.id];
    } else {
      var список = pool[state.level.id] || [];
      state.questions.forEach(function (q) {
        if (список.indexOf(q.text) < 0) список.push(q.text);
      });
      pool[state.level.id] = список;
    }
    saveRetryPool(pool);

    if (passed) addRecord(state.level, state.score, stars, state.runMs);

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
    $('res-time').textContent = форматВремени(state.runMs);

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
  $('btn-hint').addEventListener('click', useHint);
  $('btn-sound').addEventListener('click', toggleSound);

  $('btn-quit').addEventListener('click', function () {
    stopTimer();
    stopRunClock();
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

  function openRecords() {
    renderRecords();
    showScreen('screen-records');
  }

  $('btn-records').addEventListener('click', openRecords);
  $('btn-result-records').addEventListener('click', openRecords);

  $('btn-records-back').addEventListener('click', function () {
    renderMenu();
    showScreen('screen-menu');
  });

  $('btn-records-clear').addEventListener('click', function () {
    if (!confirm('Очистить таблицу рекордов? Прогресс по уровням останется.')) return;
    try { localStorage.removeItem(RECORDS_KEY); } catch (e) { /* нечего чистить */ }
    свежийРекорд = null;
    renderRecords();
  });

  /* Поле имени есть и в меню, и в таблице рекордов — держим их в согласии. */
  function bindNameField(id, другое) {
    $(id).addEventListener('input', function () {
      savePlayerName(this.value.trim());
      $(другое).value = this.value;
    });
  }

  bindNameField('player-name', 'player-name-menu');
  bindNameField('player-name-menu', 'player-name');

  $('btn-reset').addEventListener('click', function () {
    if (!confirm('Сбросить весь прогресс? Открытые уровни и очки будут удалены.')) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(RETRY_KEY);
    } catch (e) { /* нечего чистить */ }
    renderMenu();
  });

  /* Клавиатура: 1–4 — выбор ответа, H — подсказка, Enter/пробел — дальше. */
  document.addEventListener('keydown', function (e) {
    if (!$('screen-game').classList.contains('is-active')) return;

    /* «р» — та же клавиша, что H, в русской раскладке. */
    if (!state.locked && (e.key === 'h' || e.key === 'H' || e.key === 'р' || e.key === 'Р')) {
      useHint();
      return;
    }

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

  renderSoundButton();
  $('player-name-menu').value = loadPlayerName();
  renderMenu();
})();
