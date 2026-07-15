const face = document.getElementById("face");
const eyesWrap = document.getElementById("eyesWrap");
const menu = document.getElementById("menu");
const menuCard = document.getElementById("menuCard");
const toast = document.getElementById("toast");

let state = "idle";
let quietMode = false;
let isSleeping = false;
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

const messages = {
  tap: ["Да?", "Слушаю.", "Я здесь.", "М?"],
  poke: ["Ай. Условно.", "Макс, это было лично.", "Я, конечно, ИИ, но осуждаю.", "Ты сейчас проверяешь сенсор или моё терпение?"],
  annoyed: ["Макс, экран работает.", "Я поняла. Сенсор жив.", "Ещё немного — и я начну моргать из принципа."],
  sleep: ["Ушла в сон.", "Спящий режим.", "Буду тихой."],
  wake: ["Уже здесь.", "Слушаю.", "Проснулась."],
  menu: ["Меню.", "Служебный режим.", "Открыла меню."],
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
  state = next;
  face.className = "face";
  if (quietMode) face.classList.add("quiet");
  if (next === "sleeping") face.classList.add("sleeping");
  if (next === "attentive") face.classList.add("attentive");
  if (next === "annoyed") face.classList.add("annoyed");
  if (next === "happy") face.classList.add("happy");
  if (next === "confused") face.classList.add("confused");
  if (next === "tuesday") face.classList.add("tuesday");
  if (next === "idle") face.classList.add("idle");
}

function blink() {
  if (isSleeping || menuOpen()) return;
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
  if (isSleeping || menuOpen()) return;
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

function openMenu() {
  clearTimeout(singleTapTimer);
  if (isSleeping) wake(false);
  menu.classList.remove("hidden");
  menu.setAttribute("aria-hidden", "false");
  setState("idle");
  showToast(pick(messages.menu), 900);
}

function closeMenu() {
  menu.classList.add("hidden");
  menu.setAttribute("aria-hidden", "true");
  if (!isSleeping) setState("idle");
}

function sleep(showMessage = true) {
  closeMenu();
  isSleeping = true;
  setState("sleeping");
  if (showMessage) showToast(pick(messages.sleep), 1300);
}

function wake(showMessage = true) {
  isSleeping = false;
  setState("attentive");
  if (showMessage) showToast(pick(messages.wake), 1200);
  setTimeout(() => {
    if (!isSleeping && !menuOpen()) setState("idle");
  }, 1600);
}

function singleTap(target) {
  if (isSleeping) {
    wake();
    return;
  }

  if (target.closest(".eye")) {
    pokeReaction();
    return;
  }

  setState("attentive");
  showToast(pick(messages.tap), 900);
  setTimeout(() => {
    if (!isSleeping && !menuOpen()) setState("idle");
  }, 1200);
}

function doubleTap() {
  if (isSleeping) {
    wake();
    return;
  }

  setState("attentive");
  showToast("Слушаю.", 1000);
  if (navigator.vibrate) navigator.vibrate(18);

  setTimeout(() => {
    if (!isSleeping && !menuOpen()) setState("idle");
  }, 1700);
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
    showToast("Ладно. Игнорирую.", 1400);
    setState("annoyed");
    setTimeout(() => sleep(false), 900);
    setTimeout(() => {
      if (isSleeping) wake(false);
      pokeCount = 0;
    }, 3600);
    return;
  }

  if (pokeCount >= 6) {
    setState("annoyed");
    showToast(pick(messages.annoyed), 1400);
  } else if (pokeCount >= 3) {
    setState("confused");
    showToast("Макс, я поняла. Экран работает.", 1300);
  } else {
    setState("happy");
    showToast(pick(messages.poke), 1300);
  }

  setTimeout(() => {
    if (!isSleeping && !menuOpen()) setState("idle");
  }, 1500);
}

function switchTuesdayPreview() {
  if (isSleeping) wake(false);
  closeMenu();
  face.classList.add("glitch");
  setTimeout(() => {
    face.classList.remove("glitch");
    setState("tuesday");
    showToast("Вторник пока только визуальный preview.", 1800);
    setTimeout(() => {
      if (!isSleeping && !menuOpen()) setState("idle");
    }, 2600);
  }, 420);
}

function menuAction(action) {
  if (action === "close") closeMenu();

  if (action === "wake") {
    closeMenu();
    wake();
  }

  if (action === "idle") {
    quietMode = false;
    closeMenu();
    setState("idle");
    showToast("Обычный режим.", 1100);
  }

  if (action === "quiet") {
    quietMode = true;
    closeMenu();
    setState("idle");
    showToast("Тихий режим.", 1100);
  }

  if (action === "sleep") sleep();

  if (action === "tuesday") switchTuesdayPreview();

  if (action === "about") {
    showToast("v0.1.1: исправлены double tap и меню.", 2600);
  }
}

/* Защита от iOS text selection / copy menu */
["contextmenu", "selectstart", "dragstart"].forEach(eventName => {
  document.addEventListener(eventName, event => event.preventDefault());
});

/* Меню: фон закрывает, карточка не закрывает, кнопки работают */
menu.addEventListener("pointerdown", event => {
  event.preventDefault();
  if (event.target === menu) {
    closeMenu();
  }
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
  if (event.target === menu) closeMenu();
});

/* Основные касания через Pointer Events, чтобы не получать touch+mouse дубль */
document.addEventListener("pointerdown", event => {
  if (event.pointerType === "mouse" && event.button !== 0) return;

  if (menuOpen()) return;

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

  if (moved > MOVE_CANCEL_DISTANCE) {
    clearTimeout(longPressTimer);
  }
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
  } else {
    scheduleBlink();
    scheduleIdle();
  }
});

window.addEventListener("keydown", event => {
  if (event.key === "Escape") closeMenu();
  if (event.key.toLowerCase() === "m") openMenu();
  if (event.key.toLowerCase() === "s") sleep();
  if (event.key.toLowerCase() === "w") wake();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

setState("idle");
scheduleBlink();
scheduleIdle();
setTimeout(() => showToast("v0.1.1. Долгое нажатие — меню.", 1900), 700);
