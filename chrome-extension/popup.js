(async () => {
  const els = {
    enabled: document.getElementById('osint-enabled'),
    ip: document.getElementById('osint-ip'),
    domain: document.getElementById('osint-domain'),
    email: document.getElementById('osint-email'),
    hiddenLink: document.getElementById('osint-hidden-link'),
    opacity: document.getElementById('osint-opacity')
  };

  const settings = await osintLoadSettings();
  els.enabled.checked = settings.enabled;
  els.ip.checked = settings.ip;
  els.domain.checked = settings.domain;
  els.email.checked = settings.email;
  els.hiddenLink.checked = settings.hiddenLink;
  els.opacity.value = settings.opacity;

  function currentSettings() {
    return {
      enabled: els.enabled.checked,
      ip: els.ip.checked,
      domain: els.domain.checked,
      email: els.email.checked,
      hiddenLink: els.hiddenLink.checked,
      opacity: Number(els.opacity.value)
    };
  }

  for (const el of Object.values(els)) {
    el.addEventListener('input', () => osintSaveSettings(currentSettings()));
  }
})();
