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
  enableThinking: false,
  lastStatus: "",
  lastStatusAt: 0,
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
const PENDING_SEARCH_KEY = "pamPendingSearch";

captureDirectSearch();

let settings = { ...DEFAULT_SETTINGS };
let selectTimer = null;
let selecting = false;
let lastAttemptAt = 0;
let lastUrl = location.href;
let thinkingAttemptedKey = "";
let failedApplyKey = "";
let attemptedApplyKey = "";
let pendingSearchSubmitted = false;
let pendingSearchInProgress = false;
let submittedSearchPath = "";
let submittedSearchApplyKey = "";
let appliedModelKey = "";
let forceModelSelection = false;

function isSettingsRoute() {
  const hash = (location.hash || "").toLocaleLowerCase();
  return hash === "#settings" || hash.startsWith("#settings/") || location.pathname.startsWith("/settings");
}

function captureDirectSearch() {
  if (isSettingsRoute()) {
    return;
  }

  const url = new URL(location.href);
  const query = url.searchParams.get("q");
  if (!query || !location.pathname.startsWith("/search")) {
    return;
  }

  const pending = {
    query,
    capturedAt: Date.now(),
    url: location.href
  };

  sessionStorage.setItem(PENDING_SEARCH_KEY, JSON.stringify(pending));
  history.replaceState(null, "", "/");
}

async function setStatus(status) {
  settings.lastStatus = status;
  settings.lastStatusAt = Date.now();
  await chrome.storage.sync.set({
    lastStatus: status,
    lastStatusAt: settings.lastStatusAt
  });
}

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
  return element.closest("[role='menuitemradio'],[role='menuitem'],[role='option'],button,[role='button'],[aria-haspopup='menu'],[aria-expanded],a") || element;
}

function containsModelNameToken(text) {
  const normalized = normalizeText(text);
  return MODEL_NAME_TOKENS.some((token) => normalized.includes(token));
}

function modelAliases() {
  const aliases = Array.isArray(settings.aliases) ? settings.aliases : [];
  return [...new Set([settings.preferredModel, ...aliases].filter(Boolean).map(normalizeText))];
}

function modelQueryTokens() {
  return normalizeText(settings.preferredModel)
    .split(/[^a-z0-9.\u4e00-\u9fa5]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
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
    "[role='menuitemradio']",
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
    .map((element) => {
      const clickable = getClickableAncestor(element);
      return {
        element: clickable,
        text: normalizeText(textOf(clickable) || textOf(element)),
        role: clickable.getAttribute("role") || ""
      };
    })
    .map((candidate) => ({
      ...candidate,
      score: scoreModelOption(candidate.text, aliases)
    }))
    .filter((candidate) => candidate.score >= 65);

  return candidates
    .filter((candidate, index, all) => {
      return all.findIndex((other) => other.element === candidate.element) === index;
    })
    .sort((a, b) => {
      const roleScore = (candidate) => candidate.role === "menuitemradio" ? 0 : 1;
      return b.score - a.score || roleScore(a) - roleScore(b) || a.text.length - b.text.length;
    })[0]?.element || null;
}

function scoreModelOption(optionText, aliases) {
  const text = normalizeText(optionText);
  if (!text) {
    return 0;
  }

  if (aliases.some((alias) => alias && text === alias)) {
    return 120;
  }

  if (aliases.some((alias) => alias && text.includes(alias))) {
    return 105;
  }

  const tokens = modelQueryTokens();
  if (tokens.length === 0) {
    return 0;
  }

  let score = 0;
  let covered = 0;
  let previousIndex = -1;

  for (const token of tokens) {
    const index = text.indexOf(token);
    if (index >= 0) {
      covered += 1;
      score += token.length >= 4 ? 28 : 20;
      if (previousIndex >= 0 && index > previousIndex) {
        score += 8;
      }
      previousIndex = index;
      continue;
    }

    const looseMatch = text.split(/[^a-z0-9.\u4e00-\u9fa5]+/i)
      .some((part) => part.startsWith(token) || token.startsWith(part));
    if (looseMatch) {
      covered += 0.5;
      score += 10;
    }
  }

  const coverage = covered / tokens.length;
  if (coverage < 0.75) {
    return 0;
  }

  if (containsModelNameToken(text)) {
    score += 12;
  }

  score += Math.round(coverage * 35);
  return score;
}

function clickElement(element) {
  element.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, view: window }));
  element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
  element.click();
  element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
}

function getPendingSearch() {
  try {
    const raw = sessionStorage.getItem(PENDING_SEARCH_KEY);
    if (!raw) {
      return null;
    }

    const pending = JSON.parse(raw);
    if (!pending.query || Date.now() - pending.capturedAt > 120000) {
      sessionStorage.removeItem(PENDING_SEARCH_KEY);
      return null;
    }

    return pending;
  } catch (error) {
    sessionStorage.removeItem(PENDING_SEARCH_KEY);
    return null;
  }
}

function findPromptInput() {
  const selectors = [
    "textarea",
    "[contenteditable='true']",
    "[role='textbox']",
    ".ProseMirror"
  ];

  return selectors
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .filter(isVisible)
    .sort((a, b) => {
      const aRect = a.getBoundingClientRect();
      const bRect = b.getBoundingClientRect();
      return bRect.y - aRect.y || bRect.width - aRect.width;
    })[0] || null;
}

function setPromptValue(input, value) {
  input.focus();

  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  const selection = document.getSelection();
  const range = document.createRange();
  range.selectNodeContents(input);
  selection?.removeAllRanges();
  selection?.addRange(range);

  const inserted = document.execCommand("insertText", false, value);
  if (!inserted) {
    input.textContent = value;
  }

  input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function pastePromptValue(input, value) {
  input.focus();

  const data = new DataTransfer();
  data.setData("text/plain", value);

  input.dispatchEvent(new ClipboardEvent("paste", {
    bubbles: true,
    cancelable: true,
    clipboardData: data
  }));
}

function pressEnter(input) {
  input.focus();
  for (const type of ["keydown", "keypress", "keyup"]) {
    input.dispatchEvent(new KeyboardEvent(type, {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    }));
  }
}

function findExplicitSubmitButton() {
  return Array.from(document.querySelectorAll("button,[role='button']"))
    .filter(isVisible)
    .filter((button) => !button.disabled && button.getAttribute("aria-disabled") !== "true")
    .find((button) => {
      const text = normalizeText(textOf(button));
      return text === "\u63d0\u4ea4"
        || text === "\u53d1\u9001"
        || text === "send"
        || text === "submit"
        || text === "ask";
    }) || null;
}

async function waitForExplicitSubmitButton() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 2500) {
    const button = findExplicitSubmitButton();
    if (button) {
      return button;
    }

    await new Promise((resolve) => setTimeout(resolve, CLICK_DELAY_MS));
  }

  return null;
}

async function submitPendingSearchIfNeeded() {
  if (pendingSearchSubmitted || pendingSearchInProgress) {
    return;
  }

  const pending = getPendingSearch();
  if (!pending) {
    return;
  }

  pendingSearchInProgress = true;
  await new Promise((resolve) => setTimeout(resolve, 700));

  const input = findPromptInput();
  if (!input) {
    log("Pending search input not found.");
    pendingSearchInProgress = false;
    return;
  }

  pendingSearchSubmitted = true;
  submittedSearchPath = location.pathname;
  sessionStorage.removeItem(PENDING_SEARCH_KEY);

  pastePromptValue(input, pending.query);
  await new Promise((resolve) => setTimeout(resolve, 250));

  if (!normalizeText(input.value || input.innerText || input.textContent).includes(normalizeText(pending.query))) {
    setPromptValue(input, pending.query);
  }

  await new Promise((resolve) => setTimeout(resolve, 350));

  const submitButton = await waitForExplicitSubmitButton();
  if (submitButton) {
    clickElement(submitButton);
  } else {
    pressEnter(input);
  }

  pendingSearchInProgress = false;
  await setStatus(`\u5df2\u4f7f\u7528 ${settings.preferredModel} \u63d0\u4ea4\u641c\u7d22\uff1a${pending.query}`);
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

function thinkingAttemptKey() {
  return `${location.pathname}|${settings.preferredModel || ""}|${settings.enableThinking ? "on" : "off"}`;
}

function modelApplyKey() {
  return [
    location.pathname,
    settings.preferredModel || "",
    modelAliases().join("|"),
    settings.enableThinking ? "thinking" : "normal"
  ].join("::");
}

function modelStateKey() {
  return [
    settings.preferredModel || "",
    modelAliases().join("|"),
    settings.enableThinking ? "thinking" : "normal"
  ].join("::");
}

function findThinkingToggle() {
  const labels = ["\u6b63\u5728\u601d\u8003", "thinking"].map(normalizeText);
  const candidates = Array.from(document.querySelectorAll("button,[role='button'],[role='switch'],[role='checkbox'],label,div,span"))
    .filter(isVisible)
    .filter((element) => {
      const text = normalizeText(textOf(element));
      return text.length <= 120 && labels.some((label) => text.includes(label));
    });

  for (const candidate of candidates) {
    let container = candidate;
    for (let depth = 0; depth < 5 && container; depth += 1) {
      const toggle = container.querySelector("[role='switch'],[role='checkbox'],[aria-checked],input[type='checkbox'],button[data-state]");
      if (toggle && isVisible(toggle)) {
        return toggle;
      }
      container = container.parentElement;
    }
  }

  return null;
}

function isToggleOn(toggle) {
  if (toggle instanceof HTMLInputElement && toggle.type === "checkbox") {
    return toggle.checked;
  }

  const ariaChecked = toggle.getAttribute("aria-checked");
  if (ariaChecked === "true") return true;
  if (ariaChecked === "false") return false;

  const dataState = normalizeText(toggle.getAttribute("data-state"));
  if (["checked", "on", "open", "true"].includes(dataState)) return true;
  if (["unchecked", "off", "closed", "false"].includes(dataState)) return false;

  return false;
}

async function ensureThinkingEnabled(trigger, menuIsOpen = false) {
  if (!settings.enableThinking || thinkingAttemptedKey === thinkingAttemptKey()) {
    if (menuIsOpen) {
      closeOpenMenu();
    }
    return false;
  }

  thinkingAttemptedKey = thinkingAttemptKey();
  let openedMenu = false;

  try {
    if (!menuIsOpen) {
      clickElement(trigger);
      openedMenu = true;
      await new Promise((resolve) => setTimeout(resolve, CLICK_DELAY_MS));
    }

    let toggle = null;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 1800) {
      toggle = findThinkingToggle();
      if (toggle) break;
      await new Promise((resolve) => setTimeout(resolve, CLICK_DELAY_MS));
    }

    if (!toggle && menuIsOpen) {
      clickElement(trigger);
      openedMenu = true;
      await new Promise((resolve) => setTimeout(resolve, CLICK_DELAY_MS));
      toggle = findThinkingToggle();
    }

    if (!toggle) {
      log("Thinking toggle not found.");
      return false;
    }

    if (isToggleOn(toggle)) {
      log("Thinking toggle already enabled.");
      return true;
    }

    clickElement(toggle);
    log("Thinking toggle enabled.");
    return true;
  } finally {
    if (openedMenu || menuIsOpen) {
      closeOpenMenu();
    }
  }
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
  if (isSettingsRoute()) {
    return;
  }
  if (selecting) {
    if (forceModelSelection) {
      scheduleSelection(SETTLE_DELAY_MS + 100);
    }
    return;
  }

  const applyKey = modelApplyKey();
  const modelKey = modelStateKey();

  if (pendingSearchSubmitted && location.pathname.startsWith("/search/") && location.pathname !== submittedSearchPath) {
    submittedSearchPath = location.pathname;
    submittedSearchApplyKey = applyKey;
    pendingSearchSubmitted = false;
    return;
  }

  if (!forceModelSelection && submittedSearchApplyKey === applyKey) {
    return;
  }

  if (!forceModelSelection && appliedModelKey === modelKey) {
    await submitPendingSearchIfNeeded();
    return;
  }

  if (!forceModelSelection && (failedApplyKey === applyKey || attemptedApplyKey === applyKey)) {
    return;
  }

  const now = Date.now();
  const elapsedSinceLastAttempt = now - lastAttemptAt;
  if (elapsedSinceLastAttempt < SETTLE_DELAY_MS) {
    if (forceModelSelection) {
      scheduleSelection(SETTLE_DELAY_MS - elapsedSinceLastAttempt + 100);
    }
    return;
  }
  lastAttemptAt = now;
  selecting = true;
  forceModelSelection = false;

  try {
    const aliases = modelAliases();
    const trigger = findModelTrigger();
    if (!trigger) {
      log("Model trigger not found.");
      await setStatus("\u672a\u627e\u5230\u6a21\u578b\u6309\u94ae\uff0c\u8bf7\u786e\u8ba4 Perplexity \u9875\u9762\u5df2\u52a0\u8f7d\u5b8c\u6210");
      return;
    }
    attemptedApplyKey = applyKey;

    if (elementContainsAny(trigger, aliases)) {
      log("Trigger already shows preferred model.");
      failedApplyKey = "";
      attemptedApplyKey = "";
      const thinkingEnabled = await ensureThinkingEnabled(trigger, false);
      appliedModelKey = modelKey;
      await submitPendingSearchIfNeeded();
      await setStatus(`\u5df2\u662f\u5f53\u524d\u6a21\u578b\uff1a${settings.preferredModel}${thinkingEnabled ? "\uff0c\u5df2\u5c1d\u8bd5\u5f00\u542f\u601d\u8003" : ""}`);
      return;
    }

    log("Opening model selector.", trigger);
    clickElement(trigger);

    const option = await waitForPreferredOption();
    if (!option) {
      closeOpenMenu();
      log("Preferred model option not found.");
      failedApplyKey = applyKey;
      await setStatus(`\u672a\u627e\u5230\u63a5\u8fd1\u7684\u6a21\u578b\uff1a${settings.preferredModel}\uff0c\u8bf7\u91cd\u65b0\u8f93\u5165\u4e00\u4e2a\u5f53\u524d\u5b58\u5728\u7684\u6a21\u578b`);
      return;
    }

    log("Selecting preferred model.", option);
    clickElement(option);
    failedApplyKey = "";
    attemptedApplyKey = "";
    const thinkingEnabled = await ensureThinkingEnabled(trigger, true);
    appliedModelKey = modelKey;
    await submitPendingSearchIfNeeded();
    await setStatus(`\u5df2\u5207\u6362\u5230\uff1a${settings.preferredModel}${thinkingEnabled ? "\uff0c\u5df2\u5c1d\u8bd5\u5f00\u542f\u601d\u8003" : ""}`);
  } finally {
    setTimeout(() => {
      selecting = false;
    }, SETTLE_DELAY_MS);
  }
}

function scheduleSelection(delay = SETTLE_DELAY_MS) {
  clearTimeout(selectTimer);
  if (isSettingsRoute()) {
    return;
  }
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
      thinkingAttemptedKey = "";
      failedApplyKey = "";
      attemptedApplyKey = "";
      if (isSettingsRoute()) {
        clearTimeout(selectTimer);
        return;
      }
      if (!location.pathname.startsWith("/search/")) {
        pendingSearchSubmitted = false;
        pendingSearchInProgress = false;
        submittedSearchPath = "";
        submittedSearchApplyKey = "";
      }
      scheduleSelection(500);
      return;
    }

    scheduleSelection();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  window.addEventListener("hashchange", () => {
    lastUrl = location.href;
    if (isSettingsRoute()) {
      clearTimeout(selectTimer);
      return;
    }
    scheduleSelection(300);
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

  const shouldRetry = [
    "preferredModel",
    "aliases",
    "currentModelLabels",
    "enableThinking",
    "debug"
  ].some((key) => Object.prototype.hasOwnProperty.call(changes, key));

  if (!shouldRetry) {
    return;
  }

  thinkingAttemptedKey = "";
  failedApplyKey = "";
  attemptedApplyKey = "";
  submittedSearchApplyKey = "";
  appliedModelKey = "";
  forceModelSelection = true;
  scheduleSelection(200);
});
