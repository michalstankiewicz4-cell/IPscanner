// Wspolne dla content.js (content script) i popup.js (popup rozszerzenia) -
// oba wczytuja ten plik jako zwykly <script> w tym samym kontekscie.

const OSINT_DEFAULT_SETTINGS = {
  enabled: true,
  ip: true,
  domain: true,
  email: true,
  hiddenLink: true,
  opacity: 0.25
};

function osintLoadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get('osintHighlightSettings', (data) => {
      resolve(Object.assign({}, OSINT_DEFAULT_SETTINGS, data.osintHighlightSettings));
    });
  });
}

function osintSaveSettings(settings) {
  return chrome.storage.local.set({ osintHighlightSettings: settings });
}
