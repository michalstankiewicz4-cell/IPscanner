// Wykrywa i podswietla adresy IPv4, domeny, emaile oraz "ukryte" linki
// (widoczny tekst linku sugeruje jeden adres, a href prowadzi gdzie indziej)
// w tresci strony. Wlaczanie/wylaczanie poszczegolnych typow i intensywnosc
// podswietlenia sa sterowane z popupu (popup.js) przez chrome.storage -
// zmiana ustawien dziala od razu, bez przeladowania strony.
//
// Samo "wysylanie do apki" celowo NIE jest tu zaimplementowane jeszcze - to
// nastepny krok. Klikniecie w menu kontekstowym (background.js) na razie
// tylko pokazuje toast, zeby dalo sie przetestowac wykrywanie end-to-end.

(() => {
  const KNOWN_TLDS = new Set([
    'com', 'net', 'org', 'io', 'co', 'edu', 'gov', 'mil', 'info', 'biz',
    'pl', 'de', 'uk', 'us', 'ru', 'cn', 'jp', 'fr', 'es', 'it', 'nl', 'se',
    'no', 'dk', 'fi', 'ch', 'at', 'be', 'cz', 'sk', 'hu', 'ro', 'gr', 'pt',
    'ie', 'eu', 'xyz', 'dev', 'app', 'ai', 'me', 'tv', 'cc', 'online',
    'site', 'store', 'tech', 'cloud', 'one', 'top', 'live', 'pro', 'name',
    'mobi', 'asia', 'ua', 'tr', 'in', 'br', 'mx', 'ca', 'au', 'nz', 'kr'
  ]);

  const IP_BODY = String.raw`(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}`;
  const DOMAIN_BODY = String.raw`(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,24}`;
  const EMAIL_BODY = String.raw`[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}`;

  const COMBINED_RE = new RegExp(
    `(?<email>${EMAIL_BODY})|(?<ip>\\b${IP_BODY}\\b)|(?<domain>\\b${DOMAIN_BODY}\\b)`,
    'g'
  );
  const IP_FULL_RE = new RegExp(`^${IP_BODY}$`);
  const DOMAIN_FULL_RE = new RegExp(`^${DOMAIN_BODY}$`);

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION'
  ]);

  function isKnownTld(domain) {
    const parts = domain.split('.');
    return KNOWN_TLDS.has(parts[parts.length - 1].toLowerCase());
  }

  function shouldSkip(el) {
    while (el) {
      if (SKIP_TAGS.has(el.tagName)) return true;
      if (el.isContentEditable) return true;
      if (el.classList && el.classList.contains('osint-highlight')) return true;
      el = el.parentElement;
    }
    return false;
  }

  function collectTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (shouldSkip(node.parentElement)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  function processTextNode(node) {
    const text = node.nodeValue;
    COMBINED_RE.lastIndex = 0;
    let match;
    let cursor = 0;
    let found = false;
    const frag = document.createDocumentFragment();

    while ((match = COMBINED_RE.exec(text))) {
      const { email, ip, domain } = match.groups;
      let type = null;
      let value = null;
      if (email) { type = 'email'; value = email; }
      else if (ip) { type = 'ip'; value = ip; }
      else if (domain && isKnownTld(domain)) { type = 'domain'; value = domain; }

      if (!type) continue;

      found = true;
      if (match.index > cursor) {
        frag.appendChild(document.createTextNode(text.slice(cursor, match.index)));
      }
      const span = document.createElement('span');
      span.className = `osint-highlight osint-highlight--${type}`;
      span.dataset.osintType = type;
      span.dataset.osintValue = value;
      span.textContent = value;
      frag.appendChild(span);
      cursor = match.index + value.length;
    }

    if (!found) return;
    if (cursor < text.length) {
      frag.appendChild(document.createTextNode(text.slice(cursor)));
    }
    node.parentNode.replaceChild(frag, node);
  }

  function scanRoot(root) {
    for (const node of collectTextNodes(root)) {
      processTextNode(node);
    }
  }

  // Wyciaga z widocznego tekstu linku adres, ktory ten tekst zdaje sie
  // obiecywac (np. "192.168.1.1" albo "paypal.com/login" -> "paypal.com").
  function extractDisplayedTarget(text) {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const stripped = trimmed.replace(/^https?:\/\//i, '').split(/[\s/?#]/)[0];
    if (!stripped) return null;
    if (IP_FULL_RE.test(stripped)) return stripped;
    if (DOMAIN_FULL_RE.test(stripped) && isKnownTld(stripped)) return stripped.toLowerCase();
    return null;
  }

  function hostsEffectivelyMatch(displayedHost, actualHost) {
    if (displayedHost === actualHost) return true;
    return actualHost.endsWith(`.${displayedHost}`) || displayedHost.endsWith(`.${actualHost}`);
  }

  function scanLinks(root) {
    const anchors = root.querySelectorAll
      ? root.querySelectorAll('a[href]:not([data-osint-link-scanned])')
      : [];
    for (const a of anchors) {
      a.dataset.osintLinkScanned = '1';
      const displayed = extractDisplayedTarget(a.textContent);
      if (!displayed) continue;

      let actualHost;
      try {
        actualHost = new URL(a.href).hostname.toLowerCase().replace(/^www\./, '');
      } catch {
        continue;
      }
      const displayedHost = displayed.replace(/^www\./, '');
      if (hostsEffectivelyMatch(displayedHost, actualHost)) continue;

      a.title = `Uwaga: tekst linku sugeruje "${displayed}", ale prowadzi do "${actualHost}"`;

      // Celowo NIE stylujemy calej kotwicy (tlo/padding na <a>, ktora czesto
      // zawiera ikone/lamie sie na kilka linii - np. wyniki Google - psuje
      // uklad i tlo wychodzi przesuniete). Zamiast tego dokladamy klase do
      // JUZ istniejacego spana, ktory scanRoot() postawil na tym samym
      // dokladnym tekscie chwile wczesniej.
      const existingSpan = Array.from(
        a.querySelectorAll('.osint-highlight--ip, .osint-highlight--domain, .osint-highlight--email')
      ).find((span) => (span.dataset.osintValue || '').toLowerCase() === displayed.toLowerCase());

      if (existingSpan) {
        existingSpan.classList.add('osint-highlight--hidden-link');
        existingSpan.dataset.osintType = 'hiddenLink';
        existingSpan.dataset.osintValue = `${displayed} -> ${actualHost}`;
      }
    }
  }

  function scanAll(root) {
    scanRoot(root);
    scanLinks(root);
  }

  scanAll(document.body);

  // SPA-friendly: doszukaj sie nowo dodanej tresci bez petli/rescanu calej strony.
  let pendingRoots = new Set();
  let debounceTimer = null;

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const added of m.addedNodes) {
        if (added.nodeType === Node.ELEMENT_NODE) pendingRoots.add(added);
        else if (added.nodeType === Node.TEXT_NODE && added.parentElement) pendingRoots.add(added.parentElement);
      }
    }
    if (debounceTimer) return;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const roots = Array.from(pendingRoots);
      pendingRoots.clear();
      observer.disconnect();
      for (const root of roots) {
        if (document.body.contains(root)) scanAll(root);
      }
      observer.observe(document.body, { childList: true, subtree: true });
    }, 400);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Ustawienia z popupu (typy wl/wył + intensywnosc) - czysto kosmetyczne,
  // sterowane klasami na <body> i zmienna CSS, bez ponownego skanowania.
  function applySettings(settings) {
    const body = document.body;
    if (!body) return;
    body.classList.toggle('osint-disabled', !settings.enabled);
    body.classList.toggle('osint-hide-ip', !settings.ip);
    body.classList.toggle('osint-hide-domain', !settings.domain);
    body.classList.toggle('osint-hide-email', !settings.email);
    body.classList.toggle('osint-hide-hiddenLink', !settings.hiddenLink);
    document.documentElement.style.setProperty('--osint-highlight-opacity', String(settings.opacity));
  }

  osintLoadSettings().then(applySettings);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.osintHighlightSettings) return;
    applySettings(Object.assign({}, OSINT_DEFAULT_SETTINGS, changes.osintHighlightSettings.newValue));
  });

  // Menu kontekstowe (background.js) ma sie pokazywac WYLACZNIE nad naszymi
  // podswietleniami, nie przy kazdym zaznaczeniu/linku - wiec przy kazdym
  // prawym klikniecu mowimy backgroundowi, czy trafiono w nasz element (i czy
  // ten typ nie jest akurat wylaczony w popupie), a on przelacza widocznosc
  // pozycji menu tuz przed jego pokazaniem.
  function isHighlightVisible(el) {
    if (!el || !el.classList.contains('osint-highlight')) return false;
    const body = document.body;
    if (body.classList.contains('osint-disabled')) return false;
    const hideClass = {
      ip: 'osint-hide-ip',
      domain: 'osint-hide-domain',
      email: 'osint-hide-email',
      hiddenLink: 'osint-hide-hiddenLink'
    }[el.dataset.osintType];
    return !hideClass || !body.classList.contains(hideClass);
  }

  document.addEventListener('contextmenu', (event) => {
    const target = event.target instanceof Element ? event.target.closest('.osint-highlight') : null;
    const visible = isHighlightVisible(target);
    chrome.runtime.sendMessage({
      type: 'CONTEXT_TARGET',
      visible,
      value: visible ? target.dataset.osintValue : null
    });
  }, true);

  let toastTimer = null;
  function showToast(text) {
    let toast = document.getElementById('osint-net-auditor-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'osint-net-auditor-toast';
      document.documentElement.appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.add('osint-toast--visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('osint-toast--visible'), 2500);
  }

  // Akcja menu kontekstowego (background.js) - na razie tylko schowek, patrz
  // README ("Czego jeszcze nie robi") co do docelowego mechanizmu.
  async function handleCopyToClipboard({ value, detectedType, action }) {
    const actionLabel = action === 'scan' ? 'skanowania' : 'dodania do bazy';
    try {
      await navigator.clipboard.writeText(value);
      showToast(`Skopiowano ${detectedType} "${value}" do schowka - wklej w apce do ${actionLabel}.`);
    } catch {
      showToast(`Nie udało się skopiować do schowka: "${value}"`);
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === 'SHOW_TOAST') showToast(msg.text);
    if (msg.type === 'COPY_TO_CLIPBOARD') handleCopyToClipboard(msg);
  });
})();
