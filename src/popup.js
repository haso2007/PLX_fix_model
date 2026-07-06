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

const fields = {
  preferredModel: document.querySelector("#preferredModel"),
  enableThinking: document.querySelector("#enableThinking"),
  apply: document.querySelector("#apply"),
  options: document.querySelector("#options"),
  status: document.querySelector("#status")
};

let settings = { ...DEFAULT_SETTINGS };

function setStatus(text) {
  fields.status.textContent = text || "";
}

async function load() {
  settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  fields.preferredModel.value = settings.preferredModel || DEFAULT_SETTINGS.preferredModel;
  fields.enableThinking.checked = Boolean(settings.enableThinking);
  setStatus(settings.lastStatus || "");
  fields.preferredModel.focus();
  fields.preferredModel.select();
}

async function applyModel() {
  const preferredModel = fields.preferredModel.value.trim();
  if (!preferredModel) {
    setStatus("\u8bf7\u8f93\u5165\u4e00\u4e2a\u6a21\u578b\u540d\u79f0");
    return;
  }

  await chrome.storage.sync.set({
    preferredModel,
    aliases: [...new Set([preferredModel, ...(Array.isArray(settings.aliases) ? settings.aliases : [])])],
    enableThinking: fields.enableThinking.checked,
    lastStatus: "\u5df2\u4fdd\u5b58\uff0c\u6b63\u5728 Perplexity \u9875\u9762\u5c1d\u8bd5\u5e94\u7528...",
    lastStatusAt: Date.now()
  });

  setStatus("\u5df2\u4fdd\u5b58\uff0c\u6b63\u5728 Perplexity \u9875\u9762\u5c1d\u8bd5\u5e94\u7528...");
}

fields.apply.addEventListener("click", applyModel);
fields.preferredModel.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    applyModel();
  }
});

fields.options.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") {
    return;
  }

  if (changes.lastStatus) {
    setStatus(changes.lastStatus.newValue || "");
  }

  if (changes.aliases) {
    settings.aliases = changes.aliases.newValue;
  }

  if (changes.enableThinking) {
    settings.enableThinking = changes.enableThinking.newValue;
    fields.enableThinking.checked = Boolean(settings.enableThinking);
  }
});

load();
