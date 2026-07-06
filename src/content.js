const DEFAULT_SETTINGS = {
  preferredModel: "Claude Sonnet 5.0",
  aliases: [
    "Claude Sonnet 5.0",
    "Claude Sonnet 5",
    "Sonnet 5.0",
    "Sonnet 5"
  ],
  currentModelLabels: [
    "Best",
    "Auto",
    "\u6700\u4f73"
  ],
  debug: false
};

const CLICK_DELAY_MS = 220;
const SETTLE_DELAY_MS = 900;
const MAX_MENU_WAIT_MS = 4000;
const MODEL_NAME_TOKENS = [
  "claude",
  "gpt",
  "gemini",
  "sonar",
  "opus",
  "sonnet",
  "haiku",
  "o3",
  "o4",
  "deepseek",
  "grok",
  "llama",
  "mistral"
];

let settings = { ...DEFAULT_SETTINGS };
let selectTimer = null;
let selecting = false;
let lastAttemptAt = 0;
let lastUrl = location.href;

function log(...args) {
  if (settings.debug) {
    console.info("[Perplexity Preferred Model]", ...args);
  }
}

function normalizeText(value) {
  return (value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function displayText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function textOf(element) {
  return displayText(
    element.getAttribute("aria-label")
      || element.getAttribute("title")
      || element.innerText
      || element.textContent
      || ""
  );
}

function isVisible(element) {
  if (!element || !(element instanceof HTMLElement)) {
    return false;
  }

  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.visibility !== "hidden"
    && style.display !== "none"
    && rect.width > 0
    && rect.height > 0;
}

function getClickableAncestor(element) {
  return element.closest("button,[role='button'],[aria-haspopup='menu'],[aria-expanded],a") || element;
}

function containsModelNameToken(text) {
  const normalized = normalizeText(text);
  return MODEL_NAME_TOKENS.some((token) => normalized.includes(token));
}

function modelAliases() {
  const aliases = Array.isArray(settings.aliases) ? settings.aliases : [];
  return [...new Set([settings.preferredModel, ...aliases].filter(Boolean).map(normalizeText))];
}

function currentModelLabels() {
  return (Array.isArray(settings.currentModelLabels)
    ? settings.currentModelLabels
    : DEFAULT_SETTINGS.currentModelLabels
  ).map(normalizeText);
}

function elementContainsAny(element, labels) {
  const text = normalizeText(textOf(element));
  return labels.some((label) => label && text.includes(label));
}

function scoreModelTrigger(element) {
  if (!isVisible(element)) {
    return -1;
  }

  const text = normalizeText(textOf(element));
  const aliases = modelAliases();
  const currentLabels = currentModelLabels();
  let score = 0;

  if (currentLabels.some((label) => text.includes(label))) score += 90;
  if (aliases.some((alias) => text.includes(alias))) score += 90;
  if (containsModelNameToken(text)) score += 70;
  if (text.includes("model") || text.includes("\u6a21\u578b")) score += 35;
  if (element.matches("button,[role='button']")) score += 20;
  if (element.getAttribute("aria-haspopup")) score += 15;
  if (element.getAttribute("aria-expanded") !== null) score += 10;
  if (text.length > 80) score -= 30;

  const looksLikeModelControl = currentLabels.some((label) => text.includes(label))
    || aliases.some((alias) => text.includes(alias))
    || containsModelNameToken(text)
    || text.includes("model")
    || text.includes("\u6a21\u578b");

  return looksLikeModelControl ? score : -1;
}

function findModelTrigger() {
  const candidates = Array.from(document.querySelectorAll([
    "button",
    "[role='button']",
    "[aria-haspopup='menu']",
    "[aria-expanded]",
    "[aria-label*='model' i]",
    "[aria-label*='\u6a21\u578b']",
    "[aria-label*='claude' i]",
    "[aria-label*='gpt' i]",
    "[aria-label*='gemini' i]",
    "[aria-label*='sonar' i]"
  ].join(",")));

  return candidates
    .map((element) => ({ element, score: scoreModelTrigger(element) }))
    .filter((candidate) => candidate.score >= 35)
    .sort((a, b) => b.score - a.score)[0]?.element || null;
}

function optionSelectors() {
  return [
    "[role='option']",
    "[role='menuitem']",
    "[cmdk-item]",
    "button",
    "[role='button']",
    "li",
    "div"
  ].join(",");
}

function findPreferredModelOption() {
  const aliases = modelAliases();
  const candidates = Array.from(document.querySelectorAll(optionSelectors()))
    .filter(isVisible)
    .map((element) => ({ element: getClickableAncestor(element), text: normalizeText(textOf(element)) }))
    .filter((candidate) => aliases.some((alias) => candidate.text.includes(alias)));

  return candidates
    .filter((candidate, index, all) => {
      return all.findIndex((other) => other.element === candidate.element) === index;
    })
    .sort((a, b) => a.text.length - b.text.length)[0]?.element || null;
}

function clickElement(element) {
  element.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, view: window }));
  element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
  element.click();
  element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
}

function closeOpenMenu() {
  document.dispatchEvent(new KeyboardEvent("keydown", {
    key: "Escape",
    code: "Escape",
    keyCode: 27,
    which: 27,
    bubbles: true
  }));
}

async function waitForPreferredOption() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < MAX_MENU_WAIT_MS) {
    const option = findPreferredModelOption();
    if (option) {
      return option;
    }

    await new Promise((resolve) => setTimeout(resolve, CLICK_DELAY_MS));
  }

  return null;
}

async function selectPreferredModel() {
  if (selecting) {
    return;
  }

  const now = Date.now();
  if (now - lastAttemptAt < SETTLE_DELAY_MS) {
    return;
  }
  lastAttemptAt = now;
  selecting = true;

  try {
    const aliases = modelAliases();
    const trigger = findModelTrigger();
    if (!trigger) {
      log("Model trigger not found.");
      return;
    }

    if (elementContainsAny(trigger, aliases)) {
      log("Trigger already shows preferred model.");
      return;
    }

    log("Opening model selector.", trigger);
    clickElement(trigger);

    const option = await waitForPreferredOption();
    if (!option) {
      closeOpenMenu();
      log("Preferred model option not found.");
      return;
    }

    log("Selecting preferred model.", option);
    clickElement(option);
  } finally {
    setTimeout(() => {
      selecting = false;
    }, SETTLE_DELAY_MS);
  }
}

function scheduleSelection(delay = SETTLE_DELAY_MS) {
  clearTimeout(selectTimer);
  selectTimer = setTimeout(selectPreferredModel, delay);
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  settings = {
    ...DEFAULT_SETTINGS,
    ...stored,
    aliases: Array.isArray(stored.aliases) ? stored.aliases : DEFAULT_SETTINGS.aliases,
    currentModelLabels: Array.isArray(stored.currentModelLabels)
      ? stored.currentModelLabels
      : DEFAULT_SETTINGS.currentModelLabels
  };
}

function watchPage() {
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      scheduleSelection(500);
      return;
    }

    scheduleSelection();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  window.addEventListener("focus", () => scheduleSelection(300));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      scheduleSelection(300);
    }
  });
}

loadSettings().then(() => {
  watchPage();
  scheduleSelection(700);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") {
    return;
  }

  for (const [key, change] of Object.entries(changes)) {
    settings[key] = change.newValue;
  }

  scheduleSelection(200);
});
