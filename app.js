const face = document.getElementById("face");
const eyesWrap = document.getElementById("eyesWrap");
const menu = document.getElementById("menu");
const menuCard = document.getElementById("menuCard");
const toast = document.getElementById("toast");
const voiceGate = document.getElementById("voiceGate");
const unlockVoiceBtn = document.getElementById("unlockVoiceBtn");
const skipVoiceBtn = document.getElementById("skipVoiceBtn");

let quietMode = false;
let isSleeping = false;
let isListening = false;
let isSpeaking = false;
let pokeCount = 0;

let longPressTimer = null;
let toastTimer = null;
let idleTimer = null;
let blinkTimer = null;
let pokeWindowTimer = null;
let singleTapTimer = null;

let pressStart = null;
let longPressTriggered = false;
let ignoreNextClickUntil = 0;

const DOUBLE_TAP_DELAY = 285;
const LONG_PRESS_DELAY = 620;
const MOVE_CANCEL_DISTANCE = 14;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let voices = [];
let voiceUnlocked = false;
let speechKeepAliveTimer = null;

const messages = {
  tap: ["Да?", "Слушаю.", "Я здесь.", "М?"],
  poke: ["Ай. Условно.", "Макс, это было лично.", "Я, конечно, ИИ, но осуждаю.", "Ты сейчас проверяешь сенсор или моё терпение?"],
  annoyed: ["Макс, экран работает.", "Я поняла. Сенсор жив.", "Ещё немного — и я начну моргать из принципа."],
  sleep: ["Ушла в сон.", "Спящий режим.", "Буду тихой."],
  wake: ["Уже здесь.", "Слушаю.", "Проснулась."],
  menu: ["Меню.", "Служебный режим.", "Открыла меню."],
  noSpeech: ["Не расслышала.", "Повтори, пожалуйста.", "Я не поняла последнюю часть."],
};

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function menuOpen() {
  return !menu.classList.contains("hidden");
}

function showToast(text, ms = 1500) {
  if (!text) return;
  toast.textContent = text;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), ms);
}

function setState(next) {
  face.className = "face";
  if (quietMode) face.classList.add("quiet");
  if (next) face.classList.add(next);
}

function blink() {
  if (isSleeping || menuOpen() || isListening) return;
  face.classList.add("blink");
  setTimeout(() => face.classList.remove("blink"), 180);
}

function scheduleBlink() {
  clearTimeout(blinkTimer);
  const delay = 2400 + Math.random() * 4800;
  blinkTimer = setTimeout(() => {
    blink();
    scheduleBlink();
  }, delay);
}

function idleMove() {
  if (isSleeping || menuOpen() || isListening || isSpeaking) return;
  const x = (Math.random() - 0.5) * 22;
  const y = (Math.random() - 0.5) * 10;
  const s = 0.98 + Math.random() * 0.045;
  eyesWrap.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
  setTimeout(() => {
    if (!isSleeping && !menuOpen()) eyesWrap.style.transform = "";
  }, 1200 + Math.random() * 1200);
}

function scheduleIdle() {
  clearTimeout(idleTimer);
  const delay = quietMode ? 28000 + Math.random() * 30000 : 12000 + Math.random() * 24000;
  idleTimer = setTimeout(() => {
    idleMove();
    scheduleIdle();
  }, delay);
}

function loadVoices() {
  voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
}

if ("speechSynthesis" in window) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

function findFridayVoice() {
  if (!voices.length) loadVoices();
  const ruVoices = voices.filter(v => (v.lang || "").toLowerCase().startsWith("ru"));
  const femaleHints = ["milena", "alena", "anna", "elena", "female", "жен", "katya", "oksana", "russian"];
  const preferred = ruVoices.find(v => femaleHints.some(h => (v.name || "").toLowerCase().includes(h)));
  return preferred || ruVoices[0] || voices[0] || null;
}

function keepSpeechAlive() {
  clearInterval(speechKeepAliveTimer);
  speechKeepAliveTimer = setInterval(() => {
    try {
      if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.resume();
      } else {
        clearInterval(speechKeepAliveTimer);
      }
    } catch {}
  }, 250);
}

function speak(text, options = {}) {
  return new Promise(resolve => {
    if (!("speechSynthesis" in window)) {
      showToast("Голос недоступен в этом браузере.", 2000);
      resolve(false);
      return;
    }

    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ru-RU";
      utterance.rate = options.rate || 1.0;
      utterance.pitch = options.pitch || 1.04;
      utterance.volume = quietMode ? 0.55 : 1;

      const voice = findFridayVoice();
      if (voice) utterance.voice = voice;

      utterance.onstart = () => {
        voiceUnlocked = true;
        isSpeaking = true;
        keepSpeechAlive();
        if (!isSleeping && !menuOpen() && !isListening) setState("speaking");
      };

      utterance.onend = () => {
        clearInterval(speechKeepAliveTimer);
        isSpeaking = false;
        if (!isSleeping && !menuOpen() && !isListening) setState("idle");
        resolve(true);
      };

      utterance.onerror = () => {
        clearInterval(speechKeepAliveTimer);
        isSpeaking = false;
        if (!isSleeping && !menuOpen() && !isListening) setState("idle");
        showToast("iPhone заблокировал голос. Нажми «Включить голос» ещё раз.", 2600);
        if (voiceGate) voiceGate.classList.remove("hidden");
        resolve(false);
      };

      showToast(text, 1800);
      window.speechSynthesis.speak(utterance);
      setTimeout(() => {
        try { window.speechSynthesis.resume(); } catch {}
      }, 0);
    } catch (err) {
      showToast("Ошибка голосового ответа.", 1600);
      resolve(false);
    }
  });
}

function unlockVoice() {
  if (!("speechSynthesis" in window)) {
    showToast("Голос недоступен в этом браузере.", 2400);
    return;
  }

  loadVoices();
  try { window.speechSynthesis.cancel(); } catch {}
  try { window.speechSynthesis.resume(); } catch {}

  const test = new SpeechSynthesisUtterance("Голос включён.");
  test.lang = "ru-RU";
  test.rate = 1.0;
  test.pitch = 1.04;
  test.volume = 1;

  const voice = findFridayVoice();
  if (voice) test.voice = voice;

  test.onstart = () => {
    voiceUnlocked = true;
    isSpeaking = true;
    keepSpeechAlive();
    setState("speaking");
    showToast("Голос включён.", 1500);
  };

  test.onend = () => {
    clearInterval(speechKeepAliveTimer);
    isSpeaking = false;
    if (voiceGate) voiceGate.classList.add("hidden");
    if (!isSleeping && !menuOpen() && !isListening) setState("idle");
  };

  test.onerror = () => {
    clearInterval(speechKeepAliveTimer);
    isSpeaking = false;
    showToast("Голос не запустился. Попробуй открыть сайт в Safari, не с иконки.", 3200);
  };

  window.speechSynthesis.speak(test);
  setTimeout(() => {
    try { window.speechSynthesis.resume(); } catch {}
  }, 0);
}

function stopAllVoice() {
  try {
    if (recognition && isListening) recognition.stop();
  } catch {}
  try {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  } catch {}
  isListening = false;
  isSpeaking = false;
  if (!isSleeping && !menuOpen()) setState("idle");
}

function stopListeningOnly() {
  try {
    if (recognition && isListening) recognition.stop();
  } catch {}
  isListening = false;
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

function sleep(showMessage = true) {
  menu.classList.add("hidden");
  menu.setAttribute("aria-hidden", "true");
  stopListeningOnly();
  isSleeping = true;
  setState("sleeping");
  if (showMessage) speak(pick(messages.sleep));
}

function wake(showMessage = true) {
  isSleeping = false;
  setState("attentive");
  if (showMessage) speak(pick(messages.wake));
  setTimeout(() => {
    if (!isSleeping && !menuOpen() && !isListening && !isSpeaking) setState("idle");
  }, 1600);
}

function singleTap(target) {
  if (isListening || isSpeaking) return;
  if (isSleeping) {
    wake();
    return;
  }

  if (target.closest(".eye")) {
    pokeReaction();
    return;
  }

  setState("attentive");
  speak(pick(messages.tap));
}

function doubleTap() {
  if (isSleeping) {
    wake();
    return;
  }
  startListening();
}

function handleTapCandidate(target) {
  if (menuOpen() || longPressTriggered) return;

  if (singleTapTimer) {
    clearTimeout(singleTapTimer);
    singleTapTimer = null;
    doubleTap();
    return;
  }

  singleTapTimer = setTimeout(() => {
    singleTapTimer = null;
    singleTap(target);
  }, DOUBLE_TAP_DELAY);
}

function pokeReaction() {
  pokeCount += 1;
  clearTimeout(pokeWindowTimer);
  pokeWindowTimer = setTimeout(() => pokeCount = 0, 15000);

  if (pokeCount >= 9) {
    setState("annoyed");
    speak("Ладно. Игнорирую.");
    setTimeout(() => sleep(false), 900);
    setTimeout(() => {
      if (isSleeping) wake(false);
      pokeCount = 0;
    }, 3600);
    return;
  }

  if (pokeCount >= 6) {
    setState("annoyed");
    speak(pick(messages.annoyed));
  } else if (pokeCount >= 3) {
    setState("confused");
    speak("Макс, я поняла. Экран работает.");
  } else {
    setState("happy");
    speak(pick(messages.poke));
  }
}

function switchTuesdayPreview() {
  if (isSleeping) wake(false);
  menu.classList.add("hidden");
  menu.setAttribute("aria-hidden", "true");
  stopListeningOnly();
  face.classList.add("glitch");
  setTimeout(() => {
    face.classList.remove("glitch");
    setState("tuesday");
    speak("Вторник пока только визуальный режим.");
    setTimeout(() => {
      if (!isSleeping && !menuOpen() && !isSpeaking) setState("idle");
    }, 2600);
  }, 420);
}

function normalize(text) {
  return text
    .replace(/[.,!?;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function includesAny(text, words) {
  return words.some(word => text.includes(word));
}

function getTimeText() {
  const now = new Date();
  return now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function getDateText() {
  const now = new Date();
  return now.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function setupRecognition() {
  if (!SpeechRecognition) return null;

  const rec = new SpeechRecognition();
  rec.lang = "ru-RU";
  rec.continuous = false;
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  rec.onstart = () => {
    isListening = true;
    if (!isSleeping && !menuOpen()) setState("listening");
    showToast("Слушаю...", 1200);
  };

  rec.onresult = event => {
    const transcript = Array.from(event.results)
      .map(result => result[0]?.transcript || "")
      .join(" ")
      .trim()
      .toLowerCase();

    isListening = false;

    if (!transcript) {
      setState("confused");
      speak(pick(messages.noSpeech));
      return;
    }

    handleVoiceCommand(transcript);
  };

  rec.onerror = event => {
    isListening = false;
    if (!isSleeping && !menuOpen()) setState("confused");

    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      speak("Мне нужен доступ к микрофону.");
    } else if (event.error === "no-speech") {
      speak(pick(messages.noSpeech));
    } else {
      speak("Голосовое управление сейчас не сработало.");
    }
  };

  rec.onend = () => {
    isListening = false;
    if (!isSleeping && !menuOpen() && !isSpeaking) setState("idle");
  };

  return rec;
}

function startListening() {
  if (!SpeechRecognition) {
    setState("confused");
    speak("Голосовое управление недоступно в этом браузере.");
    return;
  }

  if (isSleeping) wake(false);
  menu.classList.add("hidden");
  menu.setAttribute("aria-hidden", "true");

  try {
    if (!recognition) recognition = setupRecognition();
    if (!recognition) return;

    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    isSpeaking = false;
    setState("listening");
    recognition.start();
  } catch (err) {
    isListening = false;
    setState("confused");
    speak("Я уже слушаю или микрофон занят.");
  }
}

function handleVoiceCommand(raw) {
  const text = normalize(raw);

  if (includesAny(text, ["стоп", "замолчи", "тихо", "остановись", "хватит"])) {
    stopAllVoice();
    return;
  }

  if (includesAny(text, ["спать", "усни", "засыпай", "сон"])) {
    sleep();
    return;
  }

  if (includesAny(text, ["проснись", "вставай"])) {
    wake();
    return;
  }

  if (includesAny(text, ["тихий режим", "потише"])) {
    quietMode = true;
    setState("idle");
    speak("Тихий режим.");
    return;
  }

  if (includesAny(text, ["обычный режим", "нормальный режим"])) {
    quietMode = false;
    setState("idle");
    speak("Обычный режим.");
    return;
  }

  if (includesAny(text, ["который час", "сколько времени", "время"])) {
    speak(getTimeText());
    return;
  }

  if (includesAny(text, ["какое сегодня число", "какая дата", "дата"])) {
    speak(getDateText());
    return;
  }

  if (includesAny(text, ["открой меню", "меню"])) {
    openMenu();
    return;
  }

  if (includesAny(text, ["закрой меню", "закрыть меню", "закрой"])) {
    closeMenu();
    return;
  }

  if (includesAny(text, ["вторник"])) {
    switchTuesdayPreview();
    return;
  }

  if (includesAny(text, ["тест голоса", "проверка голоса"])) {
    speak("Голос Пятницы работает. Теперь я стараюсь все ответы говорить вслух.");
    return;
  }

  if (text === "пятница" || text.endsWith(" пятница")) {
    setState("attentive");
    speak(pick(messages.tap));
    return;
  }

  setState("confused");
  speak("Пока не умею это выполнять. Я понимаю сон, пробуждение, режимы, время, дату, меню, Вторник и стоп.");
}

function menuAction(action) {
  if (action === "close") { closeMenu(); return; }
  if (action === "listen") { menu.classList.add("hidden"); menu.setAttribute("aria-hidden", "true"); startListening(); return; }
  if (action === "voice-test") { menu.classList.add("hidden"); menu.setAttribute("aria-hidden", "true"); speak("Слушаю, Макс. Голосовой ответ работает."); return; }
  if (action === "wake") { menu.classList.add("hidden"); menu.setAttribute("aria-hidden", "true"); wake(); return; }
  if (action === "idle") { quietMode = false; menu.classList.add("hidden"); menu.setAttribute("aria-hidden", "true"); setState("idle"); speak("Обычный режим."); return; }
  if (action === "quiet") { quietMode = true; menu.classList.add("hidden"); menu.setAttribute("aria-hidden", "true"); setState("idle"); speak("Тихий режим."); return; }
  if (action === "sleep") { sleep(); return; }
  if (action === "tuesday") { switchTuesdayPreview(); return; }
  if (action === "about") { menu.classList.add("hidden"); menu.setAttribute("aria-hidden", "true"); speak("Версия ноль два три дев. Добавлена разблокировка голоса на айфоне."); return; }
}

["contextmenu", "selectstart", "dragstart"].forEach(eventName => {
  document.addEventListener(eventName, event => event.preventDefault());
});

menu.addEventListener("pointerdown", event => {
  event.preventDefault();
  if (event.target === menu) closeMenu(true);
}, { passive: false });

menuCard.addEventListener("pointerdown", event => {
  event.stopPropagation();
}, { passive: false });

menuCard.addEventListener("click", event => {
  event.stopPropagation();
  const btn = event.target.closest("button");
  if (!btn) return;
  menuAction(btn.dataset.action);
});

menu.addEventListener("click", event => {
  if (event.target === menu) closeMenu(true);
});

document.addEventListener("pointerdown", event => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (menuOpen()) return;
  if (voiceGate && !voiceGate.classList.contains("hidden")) return;

  event.preventDefault();
  longPressTriggered = false;
  pressStart = { x: event.clientX, y: event.clientY, target: event.target };

  clearTimeout(longPressTimer);
  longPressTimer = setTimeout(() => {
    longPressTriggered = true;
    ignoreNextClickUntil = Date.now() + 650;
    openMenu();
    if (navigator.vibrate) navigator.vibrate(20);
  }, LONG_PRESS_DELAY);
}, { passive: false });

document.addEventListener("pointermove", event => {
  if (!pressStart) return;
  const dx = event.clientX - pressStart.x;
  const dy = event.clientY - pressStart.y;
  const moved = Math.sqrt(dx * dx + dy * dy);
  if (moved > MOVE_CANCEL_DISTANCE) clearTimeout(longPressTimer);
}, { passive: false });

document.addEventListener("pointerup", event => {
  if (!pressStart) return;
  event.preventDefault();
  clearTimeout(longPressTimer);

  const target = pressStart.target;
  pressStart = null;

  if (Date.now() < ignoreNextClickUntil) {
    longPressTriggered = false;
    return;
  }

  handleTapCandidate(target);
}, { passive: false });

document.addEventListener("pointercancel", () => {
  clearTimeout(longPressTimer);
  pressStart = null;
}, { passive: false });

document.addEventListener("click", event => {
  if (Date.now() < ignoreNextClickUntil) {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearTimeout(blinkTimer);
    clearTimeout(idleTimer);
    stopListeningOnly();
  } else {
    scheduleBlink();
    scheduleIdle();
    loadVoices();
  }
});

window.addEventListener("keydown", event => {
  if (event.key === "Escape") closeMenu(true);
  if (event.key.toLowerCase() === "m") openMenu();
  if (event.key.toLowerCase() === "s") sleep();
  if (event.key.toLowerCase() === "w") wake();
  if (event.key.toLowerCase() === "l") startListening();
});


if (unlockVoiceBtn) {
  unlockVoiceBtn.addEventListener("pointerup", event => {
    event.preventDefault();
    event.stopPropagation();
    unlockVoice();
  }, { passive: false });

  unlockVoiceBtn.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    unlockVoice();
  });
}

if (skipVoiceBtn) {
  skipVoiceBtn.addEventListener("pointerup", event => {
    event.preventDefault();
    event.stopPropagation();
    if (voiceGate) voiceGate.classList.add("hidden");
    showToast("Окей. Пока без голоса.", 1500);
  }, { passive: false });
}



/* DEV: отключаем service worker и чистим кэши, чтобы iPhone не держал старую версию */
async function disableDevCache() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(reg => reg.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    }
  } catch (err) {
    console.log("Dev cache cleanup skipped", err);
  }
}

disableDevCache();

setState("idle");
scheduleBlink();
scheduleIdle();
setTimeout(() => {
  showToast("v0.2.3-dev. Нажми «Включить голос».", 2200);
}, 700);
