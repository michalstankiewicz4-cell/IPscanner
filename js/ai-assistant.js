const AI_PROVIDER_KEY = 'netrecon_ai_provider';
const AI_MODEL_KEY_PREFIX = 'netrecon_ai_model_';
const AI_API_KEY_PREFIX = 'netrecon_ai_key_';

const AI_DEFAULT_MODELS = {
  claude: 'claude-3-5-sonnet-latest',
  google: 'gemini-1.5-flash',
  copilot: 'gpt-4o-mini'
};

let _aiBusy = false;

function aiSelectedProvider() {
  return document.getElementById('aiProviderSelect')?.value || 'claude';
}

function aiSetStatus(text, warn = false, busy = false) {
  const el = document.getElementById('aiAssistantStatus');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('ai-status-warn', !!warn);
  el.classList.toggle('ai-status-busy', !!busy);
}

function aiLoadPersistedConfig() {
  const providerSel = document.getElementById('aiProviderSelect');
  const modelInput = document.getElementById('aiModelInput');
  const keyInput = document.getElementById('aiApiKeyInput');
  if (!providerSel || !modelInput || !keyInput) return;

  const savedProvider = localStorage.getItem(AI_PROVIDER_KEY);
  providerSel.value = savedProvider && AI_DEFAULT_MODELS[savedProvider] ? savedProvider : 'claude';

  const provider = aiSelectedProvider();
  const savedModel = localStorage.getItem(`${AI_MODEL_KEY_PREFIX}${provider}`);
  modelInput.value = savedModel || AI_DEFAULT_MODELS[provider] || '';

  const savedKey = localStorage.getItem(`${AI_API_KEY_PREFIX}${provider}`);
  keyInput.value = savedKey || '';
}

function aiPersistConfig() {
  const provider = aiSelectedProvider();
  const model = document.getElementById('aiModelInput')?.value?.trim() || '';
  const apiKey = document.getElementById('aiApiKeyInput')?.value?.trim() || '';

  localStorage.setItem(AI_PROVIDER_KEY, provider);
  localStorage.setItem(`${AI_MODEL_KEY_PREFIX}${provider}`, model);
  localStorage.setItem(`${AI_API_KEY_PREFIX}${provider}`, apiKey);
}

function aiOnProviderChanged() {
  const provider = aiSelectedProvider();
  const modelInput = document.getElementById('aiModelInput');
  const keyInput = document.getElementById('aiApiKeyInput');
  if (!modelInput || !keyInput) return;

  const savedModel = localStorage.getItem(`${AI_MODEL_KEY_PREFIX}${provider}`);
  modelInput.value = savedModel || AI_DEFAULT_MODELS[provider] || '';

  const savedKey = localStorage.getItem(`${AI_API_KEY_PREFIX}${provider}`);
  keyInput.value = savedKey || '';

  localStorage.setItem(AI_PROVIDER_KEY, provider);
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

  aiPersistConfig();

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

function initAiAssistantUi() {
  aiLoadPersistedConfig();
  aiSetStatus('Idle', false, false);
}

function openAiAssistantWindow() {
  if (openToolNativeWindow('ai-assistant')) return;
  const win = document.getElementById('aiAssistantWin');
  if (!win) return;
  initAiAssistantUi();
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

document.getElementById('aiProviderSelect')?.addEventListener('change', aiOnProviderChanged);
document.getElementById('aiModelInput')?.addEventListener('change', aiPersistConfig);
document.getElementById('aiApiKeyInput')?.addEventListener('change', aiPersistConfig);

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
  initAiAssistantUi();
}
