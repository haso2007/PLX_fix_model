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

const fields = {
  preferredModel: document.querySelector("#preferredModel"),
  aliases: document.querySelector("#aliases"),
  currentModelLabels: document.querySelector("#currentModelLabels"),
  debug: document.querySelector("#debug"),
  status: document.querySelector("#status")
};

function linesToArray(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function arrayToLines(value) {
  return (Array.isArray(value) ? value : []).join("\n");
}

function setStatus(text) {
  fields.status.textContent = text;
  setTimeout(() => {
    fields.status.textContent = "";
  }, 1800);
}

function render(settings) {
  fields.preferredModel.value = settings.preferredModel;
  fields.aliases.value = arrayToLines(settings.aliases);
  fields.currentModelLabels.value = arrayToLines(settings.currentModelLabels);
  fields.debug.checked = Boolean(settings.debug);
}

async function load() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  render(settings);
}

async function save() {
  await chrome.storage.sync.set({
    preferredModel: fields.preferredModel.value.trim() || DEFAULT_SETTINGS.preferredModel,
    aliases: linesToArray(fields.aliases.value),
    currentModelLabels: linesToArray(fields.currentModelLabels.value),
    debug: fields.debug.checked
  });
  setStatus("\u5df2\u4fdd\u5b58");
}

async function restoreDefaults() {
  await chrome.storage.sync.set(DEFAULT_SETTINGS);
  render(DEFAULT_SETTINGS);
  setStatus("\u5df2\u6062\u590d\u9ed8\u8ba4");
}

document.querySelector("#save").addEventListener("click", save);
document.querySelector("#restore").addEventListener("click", restoreDefaults);

load();
