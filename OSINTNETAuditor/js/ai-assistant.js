const AI_PROVIDER_KEY = 'netrecon_ai_provider';
const AI_MODEL_KEY_PREFIX = 'netrecon_ai_model_';
const AI_API_KEY_PREFIX = 'netrecon_ai_key_';
const AI_KEY_MODE_KEY = 'netrecon_ai_key_mode';

const AI_KEY_MODE_LOCAL = 'local';
const AI_KEY_MODE_RAM = 'ram';
const AI_KEY_MODE_SECURE = 'secure';

const AI_DEFAULT_MODELS = {
  claude: 'claude-3-5-sonnet-latest',
  google: 'gemini-1.5-flash',
  copilot: 'gpt-4o-mini'
};

let _aiBusy = false;
let _aiRamKeys = {};

function aiDefaultKeyMode() {
  return _tauriInvoke ? AI_KEY_MODE_SECURE : AI_KEY_MODE_LOCAL;
}

function aiSelectedProvider() {
  return document.getElementById('aiProviderSelect')?.value || 'claude';
}

function aiSelectedKeyMode() {
  const mode = document.getElementById('aiKeyStorageMode')?.value || aiDefaultKeyMode();
  return [AI_KEY_MODE_LOCAL, AI_KEY_MODE_RAM, AI_KEY_MODE_SECURE].includes(mode) ? mode : aiDefaultKeyMode();
}

function aiSanitizeProvider(provider) {
  const p = String(provider || '').trim().toLowerCase();
  return p || 'claude';
}

async function aiStoreKey(provider, apiKey, mode = aiSelectedKeyMode()) {
  const p = aiSanitizeProvider(provider);
  const key = String(apiKey || '').trim();

  if (mode === AI_KEY_MODE_LOCAL) {
    localStorage.setItem(`${AI_API_KEY_PREFIX}${p}`, key);
    return;
  }
  if (mode === AI_KEY_MODE_RAM) {
    _aiRamKeys[p] = key;
    return;
  }
  if (mode === AI_KEY_MODE_SECURE) {
    if (!_tauriInvoke) {
      throw new Error('Secure storage is available only in desktop (Tauri) mode.');
    }
    await _tauriInvoke('ai_store_api_key_secure', { provider: p, apiKey: key });
  }
}

async function aiLoadKey(provider, mode = aiSelectedKeyMode()) {
  const p = aiSanitizeProvider(provider);

  if (mode === AI_KEY_MODE_LOCAL) {
    return localStorage.getItem(`${AI_API_KEY_PREFIX}${p}`) || '';
  }
  if (mode === AI_KEY_MODE_RAM) {
    return _aiRamKeys[p] || '';
  }
  if (mode === AI_KEY_MODE_SECURE) {
    if (!_tauriInvoke) return '';
    try {
      return (await _tauriInvoke('ai_load_api_key_secure', { provider: p })) || '';
    } catch {
      return '';
    }
  }

  return '';
}

async function aiDeleteKey(provider, mode) {
  const p = aiSanitizeProvider(provider);
  if (mode === AI_KEY_MODE_LOCAL) {
    localStorage.removeItem(`${AI_API_KEY_PREFIX}${p}`);
    return;
  }
  if (mode === AI_KEY_MODE_RAM) {
    delete _aiRamKeys[p];
    return;
  }
  if (mode === AI_KEY_MODE_SECURE) {
    if (_tauriInvoke) {
      await _tauriInvoke('ai_delete_api_key_secure', { provider: p });
    }
  }
}

function aiSetStatus(text, warn = false, busy = false) {
  const el = document.getElementById('aiAssistantStatus');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('ai-status-warn', !!warn);
  el.classList.toggle('ai-status-busy', !!busy);
}

async function aiLoadPersistedConfig() {
  const providerSel = document.getElementById('aiProviderSelect');
  const modelInput = document.getElementById('aiModelInput');
  const keyInput = document.getElementById('aiApiKeyInput');
  const modeSel = document.getElementById('aiKeyStorageMode');
  if (!providerSel || !modelInput || !keyInput || !modeSel) return;

  const savedProvider = localStorage.getItem(AI_PROVIDER_KEY);
  providerSel.value = savedProvider && AI_DEFAULT_MODELS[savedProvider] ? savedProvider : 'claude';

  const savedMode = localStorage.getItem(AI_KEY_MODE_KEY);
  modeSel.value = [AI_KEY_MODE_LOCAL, AI_KEY_MODE_RAM, AI_KEY_MODE_SECURE].includes(savedMode)
    ? savedMode
    : aiDefaultKeyMode();

  if (!_tauriInvoke) {
    modeSel.querySelector('option[value="secure"]')?.setAttribute('disabled', 'disabled');
    if (modeSel.value === AI_KEY_MODE_SECURE) {
      modeSel.value = AI_KEY_MODE_LOCAL;
    }
  }

  const provider = aiSelectedProvider();
  const savedModel = localStorage.getItem(`${AI_MODEL_KEY_PREFIX}${provider}`);
  modelInput.value = savedModel || AI_DEFAULT_MODELS[provider] || '';

  keyInput.value = await aiLoadKey(provider);
}

async function aiPersistConfig() {
  const provider = aiSelectedProvider();
  const model = document.getElementById('aiModelInput')?.value?.trim() || '';
  const apiKey = document.getElementById('aiApiKeyInput')?.value?.trim() || '';
  const mode = aiSelectedKeyMode();

  localStorage.setItem(AI_PROVIDER_KEY, provider);
  localStorage.setItem(AI_KEY_MODE_KEY, mode);
  localStorage.setItem(`${AI_MODEL_KEY_PREFIX}${provider}`, model);

  if (apiKey) {
    await aiStoreKey(provider, apiKey, mode);
  }
}

async function aiOnProviderChanged() {
  const provider = aiSelectedProvider();
  const modelInput = document.getElementById('aiModelInput');
  const keyInput = document.getElementById('aiApiKeyInput');
  if (!modelInput || !keyInput) return;

  const savedModel = localStorage.getItem(`${AI_MODEL_KEY_PREFIX}${provider}`);
  modelInput.value = savedModel || AI_DEFAULT_MODELS[provider] || '';

  keyInput.value = await aiLoadKey(provider);

  localStorage.setItem(AI_PROVIDER_KEY, provider);
}

async function aiOnKeyModeChanged() {
  const modeSel = document.getElementById('aiKeyStorageMode');
  const keyInput = document.getElementById('aiApiKeyInput');
  if (!modeSel || !keyInput) return;

  const provider = aiSelectedProvider();
  const prevMode = localStorage.getItem(AI_KEY_MODE_KEY) || aiDefaultKeyMode();
  const nextMode = aiSelectedKeyMode();
  const currentKey = keyInput.value.trim();

  localStorage.setItem(AI_KEY_MODE_KEY, nextMode);

  try {
    if (currentKey) {
      await aiStoreKey(provider, currentKey, nextMode);
      if (prevMode !== nextMode) {
        await aiDeleteKey(provider, prevMode);
      }
    }
    keyInput.value = await aiLoadKey(provider, nextMode);
  } catch (e) {
    const msg = e?.message || String(e);
    aiSetStatus(`Key mode change error: ${msg}`, true, false);
    modeSel.value = prevMode;
    localStorage.setItem(AI_KEY_MODE_KEY, prevMode);
  }
}

function aiBuildPrompt(kind) {
  const fromIp = document.getElementById('fromIp')?.value || '-';
  const toIp = document.getElementById('toIp')?.value || '-';
  const found = document.getElementById('statFound')?.textContent || '0';
  const ports = document.getElementById('statPorts')?.textContent || '0';
  const scanMode = document.getElementById('scanType')?.value || 'lan';

  const commonContext = [
    'You are a cybersecurity network analyst.',
    'Analyze the provided data conservatively and clearly.',
    'Provide practical actions with risk level: Low/Medium/High.',
    '',
    'Current scan context:',
    `- Scan mode: ${scanMode}`,
    `- Range: ${fromIp} -> ${toIp}`,
    `- Hosts found: ${found}`,
    `- Open ports total: ${ports}`,
    ''
  ].join('\n');

  switch (kind) {
    case 'network':
      return `${commonContext}\nTask: Give a network security risk review for this scan context.\nOutput sections: Summary, Top 5 risks, Immediate actions (today), Hardening plan (7 days).`;
    case 'ip':
      return `${commonContext}\nTask: Analyze likely exposure patterns for discovered IP hosts and open ports.\nOutput sections: Suspicious signals, likely false positives, prioritized investigation checklist.`;
    case 'wifi':
      return `${commonContext}\nTask: Create a WiFi security hardening checklist for home/small office.\nInclude: WPA settings, router admin hardening, IoT segmentation, guest network, DNS/firewall suggestions.`;
    case 'incident':
      return `${commonContext}\nTask: Build an incident triage playbook if unusual scanning/probing is observed.\nOutput sections: First 15 minutes, data to collect, containment, escalation criteria, post-incident actions.`;
    default:
      return commonContext;
  }
}

async function aiSendPrompt() {
  if (_aiBusy) return;
  if (!_tauriInvoke) {
    aiSetStatus('AI tool is available only in desktop (Tauri) mode.', true, false);
    return;
  }

  const provider = aiSelectedProvider();
  const model = document.getElementById('aiModelInput')?.value?.trim() || '';
  const apiKey = document.getElementById('aiApiKeyInput')?.value?.trim() || '';
  const prompt = document.getElementById('aiPromptInput')?.value?.trim() || '';
  const output = document.getElementById('aiResponseOutput');
  const sendBtn = document.getElementById('btnAiSend');

  if (!prompt) {
    aiSetStatus('Prompt is empty.', true, false);
    return;
  }
  if (!apiKey) {
    aiSetStatus('API key is required.', true, false);
    return;
  }

  await aiPersistConfig();

  _aiBusy = true;
  if (sendBtn) sendBtn.disabled = true;
  aiSetStatus(`Sending request to ${provider}...`, false, true);

  try {
    const reply = await _tauriInvoke('ai_multi_provider_query', {
      provider,
      apiKey,
      model,
      prompt
    });
    if (output) output.value = String(reply || '').trim();
    aiSetStatus(`Done (${provider}).`, false, false);
  } catch (e) {
    const msg = e?.message || String(e);
    aiSetStatus(`AI error: ${msg}`, true, false);
  } finally {
    _aiBusy = false;
    if (sendBtn) sendBtn.disabled = false;
  }
}

async function initAiAssistantUi() {
  await aiLoadPersistedConfig();
  aiSetStatus('Idle', false, false);
}

function openAiAssistantWindow() {
  if (openToolNativeWindow('ai-assistant')) return;
  const win = document.getElementById('aiAssistantWin');
  if (!win) return;
  void initAiAssistantUi();
  win.style.display = 'block';
  if (typeof window.bringToFront === 'function') window.bringToFront(win);
}

function closeAiAssistantWindow() {
  if (_toolMode === 'ai-assistant') {
    closeMainWindow();
    return;
  }
  const win = document.getElementById('aiAssistantWin');
  if (win) win.style.display = 'none';
}

window.openAiAssistantDlg = openAiAssistantWindow;
window.closeAiAssistantDlg = closeAiAssistantWindow;

document.getElementById('menuToolAiAssistant')?.addEventListener('click', () => {
  closeAllMenus();
  openAiAssistantWindow();
});

document.getElementById('aiProviderSelect')?.addEventListener('change', () => { void aiOnProviderChanged(); });
document.getElementById('aiModelInput')?.addEventListener('change', () => { void aiPersistConfig(); });
document.getElementById('aiApiKeyInput')?.addEventListener('change', () => { void aiPersistConfig(); });
document.getElementById('aiKeyStorageMode')?.addEventListener('change', () => { void aiOnKeyModeChanged(); });

document.getElementById('aiPresetNetwork')?.addEventListener('click', () => {
  const input = document.getElementById('aiPromptInput');
  if (input) input.value = aiBuildPrompt('network');
});

document.getElementById('aiPresetIp')?.addEventListener('click', () => {
  const input = document.getElementById('aiPromptInput');
  if (input) input.value = aiBuildPrompt('ip');
});

document.getElementById('aiPresetWifi')?.addEventListener('click', () => {
  const input = document.getElementById('aiPromptInput');
  if (input) input.value = aiBuildPrompt('wifi');
});

document.getElementById('aiPresetIncident')?.addEventListener('click', () => {
  const input = document.getElementById('aiPromptInput');
  if (input) input.value = aiBuildPrompt('incident');
});

document.getElementById('btnAiSend')?.addEventListener('click', aiSendPrompt);
document.getElementById('btnAiClear')?.addEventListener('click', () => {
  const input = document.getElementById('aiPromptInput');
  const output = document.getElementById('aiResponseOutput');
  if (input) input.value = '';
  if (output) output.value = '';
  aiSetStatus('Cleared.', false, false);
});

document.getElementById('btnAiClose')?.addEventListener('click', closeAiAssistantWindow);
document.getElementById('btnAiCloseBottom')?.addEventListener('click', closeAiAssistantWindow);

if (_toolMode === 'ai-assistant') {
  void initAiAssistantUi();
}
