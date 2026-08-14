// Menu kontekstowe - widoczne TYLKO nad naszymi podswietleniami (nie przy
// kazdym zaznaczeniu/linku). content.js na kazde zdarzenie 'contextmenu'
// mowi nam czy trafiono w podswietlony element (i jaka wartosc) - patrz
// wiadomosc CONTEXT_TARGET nizej. contexts: ['all'], bo o faktycznej
// widocznosci decydujemy sami przez contextMenus.update().
//
// Akcja na razie: kopiuje wartosc do schowka (interim - patrz README).
// Docelowy transport (protokol URL / lokalny serwer w apce) dopiszemy jak
// zdecydujemy sie na mechanizm.

const MENU_SCAN_ID = 'osint-scan';
const MENU_SAVE_ID = 'osint-save';

let lastContext = { visible: false, value: null };

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_SCAN_ID,
    title: 'Skanuj w OSINT NET Auditor',
    contexts: ['all'],
    visible: false
  });
  chrome.contextMenus.create({
    id: MENU_SAVE_ID,
    title: 'Dodaj do bazy OSINT NET Auditor',
    contexts: ['all'],
    visible: false
  });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'CONTEXT_TARGET') return;
  lastContext = msg;
  chrome.contextMenus.update(MENU_SCAN_ID, { visible: msg.visible });
  chrome.contextMenus.update(MENU_SAVE_ID, { visible: msg.visible });
});

function detectType(value) {
  if (/^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(value)) {
    return 'IP';
  }
  if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}$/.test(value)) {
    return 'email';
  }
  if (/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,24}$/.test(value)) {
    return 'domenę';
  }
  return 'dane';
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_SCAN_ID && info.menuItemId !== MENU_SAVE_ID) return;
  if (!tab || !tab.id || !lastContext.visible || !lastContext.value) return;

  chrome.tabs.sendMessage(tab.id, {
    type: 'COPY_TO_CLIPBOARD',
    value: lastContext.value,
    detectedType: detectType(lastContext.value),
    action: info.menuItemId === MENU_SCAN_ID ? 'scan' : 'save'
  });
});
