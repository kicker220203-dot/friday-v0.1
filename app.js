const $ = (id) => document.getElementById(id);

const face = $("face");
const eyesWrap = $("eyesWrap");
const menu = $("menu");
const menuCard = $("menuCard");
const panel = $("panel");
const panelTitle = $("panelTitle");
const panelContent = $("panelContent");
const panelClose = $("panelClose");
const toast = $("toast");
const voiceGate = $("voiceGate");
const unlockVoiceBtn = $("unlockVoiceBtn");
const skipVoiceBtn = $("skipVoiceBtn");

let mode = localStorage.getItem("friday_mode") || "normal";
let persona = "friday";
let isSleeping = false;
let isListening = false;
let isSpeaking = false;
let sessionActive = false;
let sessionTimer = null;
let pokeCount = 0;
let lastAnswer = "Я пока ничего не говорила.";
let debugEcho = false;
let micTestMode = false;

let longPressTimer = null;
let toastTimer = null;
let idleTimer = null;
let blinkTimer = null;
let pokeWindowTimer = null;
let singleTapTimer = null;
let speechWatchdog = null;
let listenWatchdog = null;
let timerInterval = null;

let pressStart = null;
let longPressTriggered = false;
let ignoreNextClickUntil = 0;

const DOUBLE_TAP_DELAY = 285;
const LONG_PRESS_DELAY = 620;
const MOVE_CANCEL_DISTANCE = 14;
const SESSION_MS = 7500;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let voices = [];

let timers = loadJSON("friday_timers", []);
let memories = loadJSON("friday_memories", []);
let noteDraftCounter = 0;

const messages = {
  tap: ["Да?", "Слушаю.", "Я здесь.", "М?"],
  poke: ["Ай. Условно.", "Макс, это было лично.", "Я, конечно, ИИ, но осуждаю.", "Ты сейчас проверяешь сенсор или моё терпение?"],
  annoyed: ["Макс, экран работает.", "Я поняла. Сенсор жив.", "Ещё немного — и я начну моргать из принципа."],
  sleep: ["Ушла в сон.", "Спящий режим.", "Буду тихой."],
  wake: ["Уже здесь.", "Слушаю.", "Проснулась."],
  menu: ["Меню.", "Служебный режим.", "Открыла меню."],
  noSpeech: ["Не расслышала.", "Повтори, пожалуйста.", "Я не поняла последнюю часть."],
};

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function menuOpen() { return !menu.classList.contains("hidden"); }
function panelOpen() { return !panel.classList.contains("hidden"); }

function showToast(text, ms = 1700) {
  if (!text) return;
  toast.textContent = text;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), ms);
}

function setState(state) {
  face.className = "face";
  if (mode === "quiet") face.classList.add("quiet");
  if (mode === "work") face.classList.add("work");
  if (persona === "tuesday") face.classList.add("tuesday");
  if (state) face.classList.add(state);
}

function applyMode(newMode, silent = false) {
  mode = newMode;
  localStorage.setItem("friday_mode", mode);
  if (!isSleeping && !isListening && !isSpeaking) setState("idle");
  if (!silent) {
    const names = { normal: "Обычный режим.", quiet: "Тихий режим.", work: "Рабочий режим." };
    speak(names[mode] || "Режим изменён.");
  }
}

function forceIdle() {
  isSpeaking = false; isListening = false;
  clearTimeout(speechWatchdog); clearTimeout(listenWatchdog);
  try { if (recognition) recognition.abort(); } catch {}
  try { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); } catch {}
  if (!isSleeping && !menuOpen() && !panelOpen()) setState("idle");
}

function blink() {
  if (isSleeping || menuOpen() || panelOpen() || isListening) return;
  face.classList.add("blink");
  setTimeout(() => face.classList.remove("blink"), 180);
}
function scheduleBlink() {
  clearTimeout(blinkTimer);
  blinkTimer = setTimeout(() => { blink(); scheduleBlink(); }, 2400 + Math.random() * 4800);
}
function idleMove() {
  if (isSleeping || menuOpen() || panelOpen() || isListening || isSpeaking) return;
  const x = (Math.random() - .5) * 22;
  const y = (Math.random() - .5) * 10;
  const s = .98 + Math.random() * .045;
  eyesWrap.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
  setTimeout(() => { if (!isSleeping && !menuOpen() && !panelOpen()) eyesWrap.style.transform = ""; }, 1200 + Math.random() * 1200);
}
function scheduleIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { idleMove(); scheduleIdle(); }, mode === "quiet" ? 30000 + Math.random() * 36000 : 12000 + Math.random() * 24000);
}

function loadVoices() { voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : []; }
if ("speechSynthesis" in window) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}
function findFridayVoice() {
  if (!voices.length) loadVoices();
  const ru = voices.filter(v => (v.lang || "").toLowerCase().startsWith("ru"));
  const hints = ["milena", "alena", "anna", "elena", "female", "жен", "katya", "oksana", "russian"];
  return ru.find(v => hints.some(h => (v.name || "").toLowerCase().includes(h))) || ru[0] || voices[0] || null;
}
function estimateSpeechMs(text) { return Math.min(11000, Math.max(1400, text.length * 76 + 850)); }

function speak(text, opts = {}) {
  lastAnswer = text;
  return new Promise(resolve => {
    showToast(text, Math.min(3600, estimateSpeechMs(text)));
    if (!("speechSynthesis" in window)) { resolve(false); return; }
    try {
      clearTimeout(speechWatchdog);
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ru-RU";
      u.rate = opts.rate || (mode === "work" ? 1.10 : 1.03);
      u.pitch = opts.pitch || (persona === "tuesday" ? 0.82 : 1.08);
      u.volume = mode === "quiet" ? 0.50 : 1;
      const v = findFridayVoice();
      if (v) u.voice = v;

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(speechWatchdog);
        isSpeaking = false;
        if (!isSleeping && !menuOpen() && !panelOpen() && !isListening) setState("idle");
        if (opts.continueSession) armSession();
        resolve(true);
      };
      u.onstart = () => {
        isSpeaking = true;
        if (!isSleeping && !menuOpen() && !panelOpen() && !isListening) setState("speaking");
      };
      u.onend = finish;
      u.onerror = finish;
      speechWatchdog = setTimeout(finish, estimateSpeechMs(text) + 1400);
      window.speechSynthesis.speak(u);
      setTimeout(() => { try { window.speechSynthesis.resume(); } catch {} }, 250);
    } catch {
      isSpeaking = false;
      if (!isSleeping && !menuOpen() && !panelOpen() && !isListening) setState("idle");
      resolve(false);
    }
  });
}

async function unlockVoice() {
  loadVoices();
  try {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
    }
  } catch {}
  voiceGate.classList.add("hidden");
  await speak("Голос включён. Пятница готова.");
}

function stopAllVoice() {
  try { if (recognition && isListening) recognition.abort(); } catch {}
  try { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); } catch {}
  clearTimeout(speechWatchdog); clearTimeout(listenWatchdog); clearTimeout(sessionTimer);
  isListening = false; isSpeaking = false; sessionActive = false;
  if (!isSleeping && !menuOpen() && !panelOpen()) setState("idle");
}
function stopListeningOnly() {
  try { if (recognition && isListening) recognition.abort(); } catch {}
  clearTimeout(listenWatchdog);
  isListening = false;
}

function armSession() {
  if (!sessionActive || isSleeping || menuOpen() || panelOpen()) return;
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => {
    if (!sessionActive || isSleeping || menuOpen() || panelOpen() || isSpeaking || isListening) return;
    startListening(false, true);
  }, 700);
}
function endSession() {
  sessionActive = false;
  clearTimeout(sessionTimer);
  stopListeningOnly();
  if (!isSleeping && !menuOpen() && !panelOpen()) setState("idle");
}

function openMenu() {
  clearTimeout(singleTapTimer);
  stopListeningOnly();
  if (isSleeping) wake(false);
  menu.classList.remove("hidden");
  menu.setAttribute("aria-hidden", "false");
  setState("idle");
  speak(pick(messages.menu));
}
function closeMenu(silent = false) {
  menu.classList.add("hidden");
  menu.setAttribute("aria-hidden", "true");
  if (!isSleeping) setState("idle");
  if (!silent) speak("Закрыла.");
}
function openPanel(title, html, voiceText = "") {
  closeMenu(true);
  panelTitle.textContent = title;
  panelContent.innerHTML = html;
  panel.classList.remove("hidden");
  panel.setAttribute("aria-hidden", "false");
  if (voiceText) speak(voiceText);
}
function closePanel(silent = true) {
  panel.classList.add("hidden");
  panel.setAttribute("aria-hidden", "true");
  if (!isSleeping && !menuOpen()) setState("idle");
  if (!silent) speak("Закрыла.");
}

function sleep(showMessage = true) {
  closeMenu(true); closePanel(true);
  stopListeningOnly();
  isSleeping = true;
  setState("sleeping");
  if (showMessage) speak(pick(messages.sleep));
}
function wake(showMessage = true) {
  isSleeping = false;
  setState("attentive");
  if (showMessage) speak(pick(messages.wake));
  setTimeout(() => { if (!isSleeping && !menuOpen() && !panelOpen() && !isListening && !isSpeaking) setState("idle"); }, 1600);
}
function singleTap(target) {
  if (isListening) return;
  if (isSpeaking) stopAllVoice();
  if (isSleeping) { wake(); return; }
  if (target.closest(".eye")) { pokeReaction(); return; }
  setState("attentive");
  speak(pick(messages.tap));
}
function doubleTap() {
  if (isSpeaking) stopAllVoice();
  if (isSleeping) { wake(); return; }
  sessionActive = true;
  startListening(false, false);
}
function handleTapCandidate(target) {
  if (menuOpen() || panelOpen() || longPressTriggered) return;
  if (singleTapTimer) {
    clearTimeout(singleTapTimer);
    singleTapTimer = null;
    doubleTap();
    return;
  }
  singleTapTimer = setTimeout(() => { singleTapTimer = null; singleTap(target); }, DOUBLE_TAP_DELAY);
}
function pokeReaction() {
  pokeCount++;
  clearTimeout(pokeWindowTimer);
  pokeWindowTimer = setTimeout(() => pokeCount = 0, 15000);
  if (pokeCount >= 9) {
    setState("annoyed");
    speak("Ладно. Игнорирую.");
    setTimeout(() => sleep(false), 900);
    setTimeout(() => { if (isSleeping) wake(false); pokeCount = 0; }, 3600);
    return;
  }
  if (pokeCount >= 6) { setState("annoyed"); speak(pick(messages.annoyed)); }
  else if (pokeCount >= 3) { setState("confused"); speak("Макс, я поняла. Экран работает."); }
  else { setState("happy"); speak(pick(messages.poke)); }
}

function tuesdayLite() {
  if (isSpeaking) stopAllVoice();
  if (isSleeping) wake(false);
  closeMenu(true); closePanel(true);
  stopListeningOnly();
  persona = "tuesday";
  face.classList.add("glitch");
  setTimeout(() => {
    face.classList.remove("glitch");
    setState("tuesday");
    speak("Вторник Lite. Без доступа к личным данным. Говори идею, я разберу её жёстче.");
    sessionActive = true;
    setTimeout(() => armSession(), 1200);
  }, 420);
}
function backToFriday() {
  persona = "friday";
  setState("attentive");
  speak("Вернула Пятницу.");
}

function normalize(text) {
  return text.replace(/[.,!?;:]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
function includesAny(text, words) { return words.some(w => text.includes(w)); }
function getTimeText() { return new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }); }
function getDateText() { return new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" }); }

function parseDuration(text) {
  const t = normalize(text);
  let total = 0;
  const hourMatch = t.match(/(\d+)\s*(час|часа|часов)/);
  const minMatch = t.match(/(\d+)\s*(минут|минута|минуты|мин)/);
  const secMatch = t.match(/(\d+)\s*(секунд|секунда|секунды|сек)/);
  if (hourMatch) total += parseInt(hourMatch[1], 10) * 3600;
  if (minMatch) total += parseInt(minMatch[1], 10) * 60;
  if (secMatch) total += parseInt(secMatch[1], 10);
  if (!total) {
    const n = t.match(/(\d+)/);
    if (n) total = parseInt(n[1], 10) * 60;
  }
  return total;
}
function formatDuration(seconds) {
  seconds = Math.max(0, Math.round(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h) return `${h} ч ${m} мин`;
  if (m) return `${m} мин ${s ? s + " сек" : ""}`.trim();
  return `${s} сек`;
}
function createTimer(seconds) {
  const id = Date.now().toString();
  const timer = { id, seconds, endAt: Date.now() + seconds * 1000, label: "таймер" };
  timers.push(timer);
  saveJSON("friday_timers", timers);
  ensureTimerTicker();
  speak("Таймер на " + formatDuration(seconds) + ".", { continueSession: true });
}
function getActiveTimers() {
  const now = Date.now();
  timers = timers.filter(t => t.endAt > now);
  saveJSON("friday_timers", timers);
  return timers;
}
function timerStatus() {
  const active = getActiveTimers();
  if (!active.length) return speak("Активных таймеров нет.", { continueSession: true });
  const nearest = active.sort((a,b) => a.endAt - b.endAt)[0];
  const left = Math.ceil((nearest.endAt - Date.now()) / 1000);
  speak("Осталось " + formatDuration(left) + ".", { continueSession: true });
}
function cancelTimers() {
  timers = [];
  saveJSON("friday_timers", timers);
  speak("Таймеры отменены.", { continueSession: true });
}
function ensureTimerTicker() {
  if (timerInterval) return;
  timerInterval = setInterval(() => {
    const now = Date.now();
    const expired = timers.filter(t => t.endAt <= now);
    if (expired.length) {
      timers = timers.filter(t => t.endAt > now);
      saveJSON("friday_timers", timers);
      speak("Таймер закончился.");
    }
  }, 1000);
}
function renderTimers() {
  const active = getActiveTimers();
  if (!active.length) {
    openPanel("Таймеры", '<div class="item">Активных таймеров нет.</div>', "Активных таймеров нет.");
    return;
  }
  const html = active.map(t => {
    const left = Math.ceil((t.endAt - Date.now()) / 1000);
    return `<div class="item"><div class="item-title">${formatDuration(left)}</div><div class="item-meta">до завершения</div></div>`;
  }).join("");
  openPanel("Таймеры", html, "Показала активные таймеры.");
}

function addMemory(content, category = "notes", importance = "medium") {
  const clean = content.trim();
  if (!clean) return speak("Что именно запомнить?", { continueSession: true });
  const mem = { id: Date.now().toString(), title: clean.slice(0, 42), content: clean, category, importance, createdAt: new Date().toISOString(), status: "active" };
  memories.push(mem);
  saveJSON("friday_memories", memories);
  speak("Запомнила.", { continueSession: true });
}
function listMemory(query = "") {
  const active = memories.filter(m => m.status !== "archived");
  if (!active.length) return speak("Память пока пустая.", { continueSession: true });
  const q = normalize(query);
  const found = q ? active.filter(m => normalize(m.content).includes(q) || normalize(m.title).includes(q)) : active.slice(-5);
  if (!found.length) return speak("По этому запросу в памяти ничего не нашла.", { continueSession: true });
  const text = found.map((m, i) => `${i + 1}. ${m.content}`).join(". ");
  speak("Вот что я помню. " + text, { continueSession: true });
}
function forgetMemory(query = "") {
  const q = normalize(query);
  if (!q) return speak("Скажи, что именно забыть.", { continueSession: true });
  const before = memories.length;
  memories = memories.filter(m => !(normalize(m.content).includes(q) || normalize(m.title).includes(q)));
  saveJSON("friday_memories", memories);
  const removed = before - memories.length;
  speak(removed ? "Удалила из памяти." : "Не нашла такую запись.", { continueSession: true });
}
function renderMemory() {
  const active = memories.filter(m => m.status !== "archived");
  const html = active.length
    ? active.slice().reverse().map(m => `<div class="item"><div class="item-title">${escapeHTML(m.title)}</div><div>${escapeHTML(m.content)}</div><div class="item-meta">${m.category} • ${m.importance}</div></div>`).join("")
    : '<div class="item">Память пока пустая.</div>';
  openPanel("Память", html, active.length ? "Открыла память." : "Память пока пустая.");
}
function escapeHTML(s) {
  return s.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function setupRecognition() {
  if (!SpeechRecognition) return null;
  const r = new SpeechRecognition();
  r.lang = "ru-RU";
  r.continuous = false;
  r.interimResults = true;
  r.maxAlternatives = 1;
  r.onstart = () => {
    isListening = true;
    if (!isSleeping && !menuOpen() && !panelOpen()) setState("listening");
    showToast(micTestMode ? "Тест микрофона: скажи любую фразу." : "Слушаю...", 1400);
    clearTimeout(listenWatchdog);
    listenWatchdog = setTimeout(() => {
      if (isListening) {
        try { r.stop(); } catch {}
        isListening = false;
        setState("confused");
        speak("Я слушала, но ничего не разобрала.", { continueSession: sessionActive });
      }
    }, 9000);
  };
  r.onresult = e => {
    let finalText = "", interimText = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const part = e.results[i][0]?.transcript || "";
      if (e.results[i].isFinal) finalText += part;
      else interimText += part;
    }
    const heard = (finalText || interimText).trim();
    if (heard) showToast("Слышу: " + heard, 1800);
    if (!finalText) return;
    clearTimeout(listenWatchdog);
    isListening = false;
    const tr = finalText.trim().toLowerCase();
    if (!tr) return speak(pick(messages.noSpeech), { continueSession: sessionActive });
    handleVoiceCommand(tr);
  };
  r.onerror = e => {
    clearTimeout(listenWatchdog);
    isListening = false;
    if (!isSleeping && !menuOpen() && !panelOpen()) setState("confused");
    const msg = e.error === "not-allowed" || e.error === "service-not-allowed"
      ? "Мне нужен доступ к микрофону."
      : e.error === "no-speech"
        ? pick(messages.noSpeech)
        : "Голосовое управление сейчас не сработало. Ошибка: " + e.error;
    speak(msg, { continueSession: sessionActive });
  };
  r.onend = () => {
    clearTimeout(listenWatchdog);
    isListening = false;
    if (!isSleeping && !menuOpen() && !panelOpen() && !isSpeaking) setState("idle");
  };
  return r;
}
function startListening(test = false, fromSession = false) {
  if (isSpeaking) stopAllVoice();
  if (!SpeechRecognition) return speak("Голосовое управление недоступно в этом браузере.");
  if (isSleeping) wake(false);
  closeMenu(true);
  closePanel(true);
  micTestMode = test;
  if (!fromSession && !test) sessionActive = true;
  try {
    recognition = setupRecognition();
    if ("speechSynthesis" in window) { window.speechSynthesis.cancel(); window.speechSynthesis.resume(); }
    isSpeaking = false;
    setState("listening");
    recognition.start();
  } catch {
    isListening = false;
    setState("confused");
    speak("Я уже слушаю или микрофон занят.", { continueSession: sessionActive });
  }
}

function handleVoiceCommand(raw) {
  const text = normalize(raw);
  if (micTestMode) {
    micTestMode = false;
    return speak("Я услышала: " + raw + ".", { continueSession: false });
  }
  const prefix = debugEcho ? "Я услышала: " + raw + ". " : "";

  if (includesAny(text, ["стоп", "замолчи", "тихо", "остановись", "хватит"])) { stopAllVoice(); endSession(); return; }
  if (includesAny(text, ["отбой", "всё", "все", "до связи", "закончить", "закрой сессию"])) { endSession(); return speak("Отбой."); }
  if (includesAny(text, ["повтори", "повтор"])) return speak(lastAnswer, { continueSession: sessionActive });

  if (includesAny(text, ["спать", "усни", "засыпай", "сон"])) { return speak(prefix + "Ухожу в сон.").then(() => sleep(false)); }
  if (includesAny(text, ["проснись", "вставай"])) { isSleeping = false; setState("attentive"); return speak(prefix + "Уже здесь.", { continueSession: sessionActive }); }

  if (includesAny(text, ["тихий режим", "потише"])) { applyMode("quiet", true); return speak(prefix + "Тихий режим.", { continueSession: sessionActive }); }
  if (includesAny(text, ["рабочий режим", "работа", "соберись"])) { applyMode("work", true); return speak(prefix + "Рабочий режим.", { continueSession: sessionActive }); }
  if (includesAny(text, ["обычный режим", "нормальный режим"])) { applyMode("normal", true); return speak(prefix + "Обычный режим.", { continueSession: sessionActive }); }

  if (includesAny(text, ["который час", "сколько времени", "время"])) return speak(prefix + getTimeText(), { continueSession: sessionActive });
  if (includesAny(text, ["какое сегодня число", "какая дата", "дата"])) return speak(prefix + getDateText(), { continueSession: sessionActive });

  if (includesAny(text, ["поставь таймер", "засеки", "дай мне", "таймер на", "отсчитай"])) {
    const seconds = parseDuration(text);
    if (!seconds || seconds < 1) return speak("На сколько поставить таймер?", { continueSession: sessionActive });
    return createTimer(seconds);
  }
  if (includesAny(text, ["сколько осталось", "остаток", "сколько там осталось"])) return timerStatus();
  if (includesAny(text, ["отмени таймер", "убери таймер", "сбрось таймер"])) return cancelTimers();

  if (includesAny(text, ["что ты умеешь", "помощь", "команды"])) return speak(abilitiesText(), { continueSession: sessionActive });
  if (includesAny(text, ["режимы"])) return speak("Есть обычный режим, рабочий режим, тихий режим, сон и Вторник Lite.", { continueSession: sessionActive });

  if (text.startsWith("запомни") || text.startsWith("сохрани") || text.includes("не забудь")) {
    let content = raw.replace(/^(запомни|сохрани)\s*/i, "").replace(/не забудь\s*/i, "").trim();
    return addMemory(content);
  }
  if (includesAny(text, ["что ты помнишь", "память", "что в памяти"])) {
    const query = raw.replace(/что ты помнишь|память|что в памяти/ig, "").trim();
    return listMemory(query);
  }
  if (text.startsWith("забудь") || text.startsWith("удали из памяти")) {
    const query = raw.replace(/^(забудь|удали из памяти)\s*/i, "").trim();
    return forgetMemory(query);
  }

  if (includesAny(text, ["открой меню", "меню"])) return speak(prefix + "Открываю меню.").then(openMenu);
  if (includesAny(text, ["закрой меню", "закрыть меню", "закрой"])) { closeMenu(); closePanel(); return; }

  if (includesAny(text, ["вторник"])) return tuesdayLite();
  if (includesAny(text, ["верни пятницу", "пятница обратно"])) return backToFriday();

  if (persona === "tuesday") {
    return speak(tuesdayAnalyze(raw), { continueSession: sessionActive });
  }

  if (includesAny(text, ["ai", "искусственный интеллект", "чат"])) {
    return speak("AI-модуль в веб-версии пока отключён. Нужен отдельный сервер, чтобы не хранить ключ прямо в сайте.", { continueSession: sessionActive });
  }

  if (text === "пятница" || text.endsWith(" пятница")) {
    setState("attentive");
    return speak(prefix + pick(messages.tap), { continueSession: sessionActive });
  }

  setState("confused");
  speak("Пока не умею это выполнять. Скажи: что ты умеешь.", { continueSession: sessionActive });
}
function abilitiesText() {
  return "Я умею говорить голосом, слушать команды, ставить таймеры, говорить время и дату, переключать режимы, спать и просыпаться, запоминать простые заметки, читать память, забывать записи, повторять последний ответ и включать Вторника Lite.";
}
function tuesdayAnalyze(raw) {
  const idea = raw.trim();
  if (!idea) return "Сформулируй идею, Максим.";
  return "Разбор Вторника. Идея: " + idea + ". Первое: проверь, решает ли она реальную задачу. Второе: оцени цену времени. Третье: не добавляй это в v1, если без этого проект всё ещё работает. Мой вердикт: занести в бэклог, если это не блокирует текущую версию.";
}

function menuAction(action) {
  if (action === "close") return closeMenu();
  if (action === "listen") return startListening(false);
  if (action === "mic-test") return startListening(true);
  if (action === "voice-test") { closeMenu(true); return speak("Слушаю, Макс. Голосовой ответ работает."); }
  if (action === "abilities") { closeMenu(true); return speak(abilitiesText()); }
  if (action === "memory") return renderMemory();
  if (action === "timers") return renderTimers();
  if (action === "tuesday") return tuesdayLite();
  if (action === "wake") { closeMenu(true); return wake(); }
  if (action === "idle") { closeMenu(true); return applyMode("normal"); }
  if (action === "work") { closeMenu(true); return applyMode("work"); }
  if (action === "quiet") { closeMenu(true); return applyMode("quiet"); }
  if (action === "sleep") return sleep();
  if (action === "reset") { forceIdle(); showToast("Состояние сброшено.", 1600); return speak("Сбросила зависание."); }
  if (action === "about") { closeMenu(true); return speak("Пятница v0.5-web. Максимальная веб-версия без внешнего AI. Голос, память, таймеры, режимы и Вторник Lite."); }
}

["contextmenu", "selectstart", "dragstart"].forEach(n => document.addEventListener(n, e => e.preventDefault()));

unlockVoiceBtn.addEventListener("click", unlockVoice);
skipVoiceBtn.addEventListener("click", () => { voiceGate.classList.add("hidden"); showToast("Продолжили без разблокировки голоса.", 1600); });

menu.addEventListener("pointerdown", e => { e.preventDefault(); if (e.target === menu) closeMenu(true); }, { passive: false });
menuCard.addEventListener("pointerdown", e => e.stopPropagation(), { passive: false });
menuCard.addEventListener("click", e => { e.stopPropagation(); const b = e.target.closest("button"); if (b) menuAction(b.dataset.action); });
menu.addEventListener("click", e => { if (e.target === menu) closeMenu(true); });

panel.addEventListener("pointerdown", e => { e.preventDefault(); if (e.target === panel) closePanel(true); }, { passive: false });
panel.querySelector(".panel-card").addEventListener("pointerdown", e => e.stopPropagation(), { passive: false });
panelClose.addEventListener("click", () => closePanel(false));

document.addEventListener("pointerdown", e => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  if (menuOpen() || panelOpen() || !voiceGate.classList.contains("hidden")) return;
  e.preventDefault();
  longPressTriggered = false;
  pressStart = { x: e.clientX, y: e.clientY, target: e.target };
  clearTimeout(longPressTimer);
  longPressTimer = setTimeout(() => {
    longPressTriggered = true;
    ignoreNextClickUntil = Date.now() + 650;
    openMenu();
    if (navigator.vibrate) navigator.vibrate(20);
  }, LONG_PRESS_DELAY);
}, { passive: false });
document.addEventListener("pointermove", e => {
  if (!pressStart) return;
  const dx = e.clientX - pressStart.x, dy = e.clientY - pressStart.y;
  if (Math.sqrt(dx * dx + dy * dy) > MOVE_CANCEL_DISTANCE) clearTimeout(longPressTimer);
}, { passive: false });
document.addEventListener("pointerup", e => {
  if (!pressStart) return;
  e.preventDefault();
  clearTimeout(longPressTimer);
  const target = pressStart.target;
  pressStart = null;
  if (Date.now() < ignoreNextClickUntil) { longPressTriggered = false; return; }
  handleTapCandidate(target);
}, { passive: false });
document.addEventListener("pointercancel", () => { clearTimeout(longPressTimer); pressStart = null; }, { passive: false });
document.addEventListener("click", e => { if (Date.now() < ignoreNextClickUntil) { e.preventDefault(); e.stopPropagation(); } }, true);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) { clearTimeout(blinkTimer); clearTimeout(idleTimer); stopListeningOnly(); }
  else { scheduleBlink(); scheduleIdle(); loadVoices(); }
});
window.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeMenu(true); closePanel(true); }
  if (e.key.toLowerCase() === "m") openMenu();
  if (e.key.toLowerCase() === "s") sleep();
  if (e.key.toLowerCase() === "w") wake();
  if (e.key.toLowerCase() === "l") startListening(false);
  if (e.key.toLowerCase() === "r") forceIdle();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
}
if ("caches" in window) {
  caches.keys().then(ks => ks.forEach(k => caches.delete(k))).catch(() => {});
}

applyMode(mode, true);
ensureTimerTicker();
setState("idle");
scheduleBlink();
scheduleIdle();
setTimeout(() => showToast("v0.5-web. Нажми «Включить голос».", 2400), 700);
