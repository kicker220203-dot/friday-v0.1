const face = document.getElementById("face");
const eyesWrap = document.getElementById("eyesWrap");
const menu = document.getElementById("menu");
const toast = document.getElementById("toast");

let state = "idle";
let quietMode = false;
let isSleeping = false;
let tapCount = 0;
let lastTapAt = 0;
let longPressTimer = null;
let toastTimer = null;
let idleTimer = null;
let blinkTimer = null;
let pokeWindowTimer = null;
let didLongPress = false;

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

function menuOpen() {
  return !menu.classList.contains("hidden");
}

function openMenu() {
  didLongPress = true;
  if (isSleeping) wake(false);
  menu.classList.remove("hidden");
  menu.setAttribute("aria-hidden", "false");
  setState("idle");
  showToast(pick(messages.menu), 1100);
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

function attentive() {
  if (isSleeping) return wake();
  setState("attentive");
  showToast(pick(messages.tap), 1000);
  setTimeout(() => {
    if (!isSleeping && !menuOpen()) setState("idle");
  }, 1600);
}

function pokeReaction() {
  if (isSleeping) return wake();
  tapCount += 1;
  clearTimeout(pokeWindowTimer);
  pokeWindowTimer = setTimeout(() => tapCount = 0, 15000);

  if (tapCount >= 9) {
    showToast("Ладно. Игнорирую.", 1400);
    setState("annoyed");
    setTimeout(() => sleep(false), 900);
    setTimeout(() => {
      if (isSleeping) wake(false);
      tapCount = 0;
    }, 3600);
    return;
  }

  if (tapCount >= 6) {
    setState("annoyed");
    showToast(pick(messages.annoyed), 1400);
  } else if (tapCount >= 3) {
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

function handleTap(event) {
  if (didLongPress) {
    didLongPress = false;
    return;
  }
  if (menuOpen()) return;
  const now = Date.now();
  const delta = now - lastTapAt;
  lastTapAt = now;

  const target = event.target;
  const touchedEye = target.closest && target.closest(".eye");

  if (delta < 280) {
    attentive();
    return;
  }

  if (touchedEye) {
    pokeReaction();
    return;
  }

  if (isSleeping) wake();
  else {
    setState("attentive");
    setTimeout(() => {
      if (!isSleeping && !menuOpen()) setState("idle");
    }, 800);
  }
}

function startLongPress() {
  didLongPress = false;
  clearTimeout(longPressTimer);
  longPressTimer = setTimeout(() => {
    openMenu();
    if (navigator.vibrate) navigator.vibrate(20);
  }, 620);
}

function cancelLongPress() {
  clearTimeout(longPressTimer);
}

function switchTuesdayPreview() {
  if (isSleeping) wake(false);
  closeMenu();
  face.classList.add("glitch");
  setTimeout(() => {
    face.classList.remove("glitch");
    setState("tuesday");
    showToast("Вторник пока только визуальный preview.", 1800);
    setTimeout(() => setState("idle"), 2800);
  }, 420);
}

menu.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) {
    closeMenu();
    return;
  }

  const action = btn.dataset.action;
  if (action === "close") closeMenu();
  if (action === "wake") { closeMenu(); wake(); }
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
  if (action === "about") showToast("v0.1: лицо, касания, меню, сон. Без AI и голоса.", 2600);
});

menu.addEventListener("touchend", (e) => e.stopPropagation());
menu.addEventListener("mouseup", (e) => e.stopPropagation());

document.addEventListener("touchstart", startLongPress, { passive: true });
document.addEventListener("touchmove", cancelLongPress, { passive: true });
document.addEventListener("touchend", (e) => { cancelLongPress(); handleTap(e); }, { passive: true });
document.addEventListener("mousedown", startLongPress);
document.addEventListener("mousemove", cancelLongPress);
document.addEventListener("mouseup", (e) => { cancelLongPress(); handleTap(e); });

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearTimeout(blinkTimer);
    clearTimeout(idleTimer);
  } else {
    scheduleBlink();
    scheduleIdle();
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
  if (e.key.toLowerCase() === "m") openMenu();
  if (e.key.toLowerCase() === "s") sleep();
  if (e.key.toLowerCase() === "w") wake();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

setState("idle");
scheduleBlink();
scheduleIdle();
setTimeout(() => showToast("Долгое нажатие — меню.", 1800), 700);
