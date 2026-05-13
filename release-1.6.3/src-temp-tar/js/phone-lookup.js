// Phone Reverse Lookup Tool
// Integrates NumVerify, OpenCellID, and Google People API

let phoneLookupState = {
  currentNumber: '',
  results: null,
  isLoading: false,
  apiKeys: {
    numverify: localStorage.getItem('phoneLookup_numverify_key') || '',
    opencellid: localStorage.getItem('phoneLookup_opencellid_key') || '',
    google: localStorage.getItem('phoneLookup_google_key') || ''
  }
};

function initPhoneLookup() {
  const menuItem = document.getElementById('menuToolPhoneLookup');
  const win = document.getElementById('phoneLookupWin');
  const closeBtn = document.getElementById('btnPhoneLookupClose');
  const searchBtn = document.getElementById('btnPhoneLookupSearch');
  const copyBtn = document.getElementById('btnPhoneLookupCopy');
  const clearBtn = document.getElementById('btnPhoneLookupClear');
  const saveKeysBtn = document.getElementById('btnPhoneLookupSaveKeys');
  const clearKeysBtn = document.getElementById('btnPhoneLookupClearKeys');
  const input = document.getElementById('phoneLookupInput');
  const titlebar = document.getElementById('phoneLookupTitlebar');
  const numverifyKeyInput = document.getElementById('phoneLookupNumVerifyKey');
  const opencellIdKeyInput = document.getElementById('phoneLookupOpenCellIDKey');
  const googleKeyInput = document.getElementById('phoneLookupGoogleKey');

  if (!menuItem || !win) return;

  // Load saved API keys on init
  numverifyKeyInput.value = phoneLookupState.apiKeys.numverify;
  opencellIdKeyInput.value = phoneLookupState.apiKeys.opencellid;
  googleKeyInput.value = phoneLookupState.apiKeys.google;

  // Menu item click
  menuItem.addEventListener('click', () => {
    if (win.style.display === 'none' || !win.style.display) {
      win.style.display = 'block';
      input.focus();
    } else {
      win.style.display = 'none';
    }
  });

  // Close button
  closeBtn.addEventListener('click', () => {
    win.style.display = 'none';
  });

  // Save API Keys
  saveKeysBtn.addEventListener('click', () => {
    phoneLookupState.apiKeys.numverify = numverifyKeyInput.value;
    phoneLookupState.apiKeys.opencellid = opencellIdKeyInput.value;
    phoneLookupState.apiKeys.google = googleKeyInput.value;

    localStorage.setItem('phoneLookup_numverify_key', phoneLookupState.apiKeys.numverify);
    localStorage.setItem('phoneLookup_opencellid_key', phoneLookupState.apiKeys.opencellid);
    localStorage.setItem('phoneLookup_google_key', phoneLookupState.apiKeys.google);

    const status = document.getElementById('phoneLookupStatus');
    status.textContent = 'API keys saved.';
    setTimeout(() => {
      status.textContent = 'Ready.';
    }, 2000);
  });

  // Clear API Keys
  clearKeysBtn.addEventListener('click', () => {
    numverifyKeyInput.value = '';
    opencellIdKeyInput.value = '';
    googleKeyInput.value = '';

    phoneLookupState.apiKeys.numverify = '';
    phoneLookupState.apiKeys.opencellid = '';
    phoneLookupState.apiKeys.google = '';

    localStorage.removeItem('phoneLookup_numverify_key');
    localStorage.removeItem('phoneLookup_opencellid_key');
    localStorage.removeItem('phoneLookup_google_key');

    const status = document.getElementById('phoneLookupStatus');
    status.textContent = 'API keys cleared.';
    setTimeout(() => {
      status.textContent = 'Ready.';
    }, 2000);
  });

  // Search button
  searchBtn.addEventListener('click', () => {
    const phone = input.value.trim();
    if (phone) {
      phoneLookupSearch(phone);
    }
  });

  // Enter key
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      phoneLookupSearch(input.value.trim());
    }
  });

  // Copy button
  copyBtn.addEventListener('click', () => {
    const resultsWrap = document.getElementById('phoneLookupResultsWrap');
    if (resultsWrap && phoneLookupState.results) {
      const text = phoneLookupState.results.text || '';
      navigator.clipboard.writeText(text);
      const status = document.getElementById('phoneLookupStatus');
      status.textContent = 'Copied to clipboard.';
      setTimeout(() => {
        status.textContent = 'Ready.';
      }, 2000);
    }
  });

  // Clear button
  clearBtn.addEventListener('click', () => {
    input.value = '';
    document.getElementById('phoneLookupResultsWrap').innerHTML = '';
    document.getElementById('phoneLookupStatus').textContent = 'Ready.';
    phoneLookupState.results = null;
  });

  // Make window draggable
  makeDraggable(titlebar, win);
}

async function phoneLookupSearch(phoneNumber) {
  const statusEl = document.getElementById('phoneLookupStatus');
  const resultsWrap = document.getElementById('phoneLookupResultsWrap');

  if (!phoneNumber) {
    statusEl.textContent = 'Error: Empty phone number.';
    return;
  }

  if (!phoneLookupState.apiKeys.numverify && !phoneLookupState.apiKeys.opencellid && !phoneLookupState.apiKeys.google) {
    statusEl.textContent = 'Error: No API keys configured. Please enter at least one API key above.';
    resultsWrap.innerHTML = '<div class="phonelookup-error">No API keys configured. Please save your API keys first.</div>';
    return;
  }

  phoneLookupState.isLoading = true;
  phoneLookupState.currentNumber = phoneNumber;
  statusEl.textContent = 'Searching...';
  resultsWrap.innerHTML = '';

  try {
    // Call backend for phone lookup
    let response;
    try {
      response = await window.__TAURI__.invoke('phone_lookup_query', {
        phoneNumber: phoneNumber,
        numverifyKey: phoneLookupState.apiKeys.numverify,
        opencellIdKey: phoneLookupState.apiKeys.opencellid,
        googleKey: phoneLookupState.apiKeys.google
      });
    } catch (tauriErr) {
      console.error('Tauri error:', tauriErr);
      // Fallback for browser mode
      response = await phoneLookupBrowserFallback(phoneNumber);
    }

    if (response && response.error) {
      statusEl.textContent = `Error: ${response.error}`;
      resultsWrap.innerHTML = `<div class="phonelookup-error">${response.error}</div>`;
      return;
    }

    phoneLookupState.results = response;
    displayPhoneLookupResults(response);
    statusEl.textContent = 'Search complete.';

  } catch (error) {
    console.error('Phone lookup error:', error);
    statusEl.textContent = `Error: ${error.message}`;
    resultsWrap.innerHTML = `<div class="phonelookup-error">${error.message}</div>`;
  } finally {
    phoneLookupState.isLoading = false;
  }
}

function displayPhoneLookupResults(data) {
  const resultsWrap = document.getElementById('phoneLookupResultsWrap');
  resultsWrap.innerHTML = '';

  // Build result text for copy
  let resultText = `Phone: ${phoneLookupState.currentNumber}\n`;
  resultText += '='.repeat(60) + '\n\n';

  // Create collapsible sections
  const sections = [];

  // NumVerify Data
  if (data.numverify) {
    const nv = data.numverify;
    sections.push({
      title: '📍 NumVerify - Phone Validation',
      content: `
        <div class="phonelookup-row"><strong>Valid:</strong> ${nv.valid ? 'Yes' : 'No'}</div>
        <div class="phonelookup-row"><strong>Country:</strong> ${nv.country_name} (${nv.country_code})</div>
        <div class="phonelookup-row"><strong>Type:</strong> ${nv.number_type || 'Unknown'}</div>
        <div class="phonelookup-row"><strong>Carrier:</strong> ${nv.carrier || 'Unknown'}</div>
        <div class="phonelookup-row"><strong>Format International:</strong> ${nv.international_format}</div>
        <div class="phonelookup-row"><strong>Format National:</strong> ${nv.national_format}</div>
        <div class="phonelookup-row"><strong>Location:</strong> ${nv.location || 'Unknown'}</div>
      `,
      textContent: `Valid: ${nv.valid}\nCountry: ${nv.country_name}\nType: ${nv.number_type}\nCarrier: ${nv.carrier}\nLocation: ${nv.location}`
    });
  }

  // OpenCellID Data
  if (data.opencellid && data.opencellid.length > 0) {
    const occ = data.opencellid[0];
    sections.push({
      title: '🗼 OpenCellID - Cell Tower Geolocation',
      content: `
        <div class="phonelookup-row"><strong>Country:</strong> ${occ.country || 'Unknown'}</div>
        <div class="phonelookup-row"><strong>Operator:</strong> ${occ.operator || 'Unknown'}</div>
        <div class="phonelookup-row"><strong>Network Type:</strong> ${occ.network || 'Unknown'}</div>
        <div class="phonelookup-row"><strong>Latitude:</strong> ${occ.lat || 'N/A'}</div>
        <div class="phonelookup-row"><strong>Longitude:</strong> ${occ.lon || 'N/A'}</div>
        <div class="phonelookup-row"><strong>Accuracy (m):</strong> ${occ.range || 'Unknown'}</div>
        <div class="phonelookup-row" style="margin-top: 8px;">
          ${occ.lat && occ.lon ? `<a href="https://maps.google.com/?q=${occ.lat},${occ.lon}" target="_blank" class="link-style">View on Google Maps 🗺</a>` : 'No coordinates available'}
        </div>
      `,
      textContent: `Country: ${occ.country}\nOperator: ${occ.operator}\nLat/Lon: ${occ.lat},${occ.lon}\nAccuracy: ${occ.range}m`
    });
  }

  // Google People API Data
  if (data.people_api) {
    const ppl = data.people_api;
    sections.push({
      title: '👤 Google People API - Public Profile',
      content: `
        <div class="phonelookup-row"><strong>Name:</strong> ${ppl.name || 'Not found'}</div>
        <div class="phonelookup-row"><strong>Email:</strong> ${ppl.email || 'Not public'}</div>
        <div class="phonelookup-row"><strong>Organization:</strong> ${ppl.organization || 'Not listed'}</div>
        <div class="phonelookup-row"><strong>Photo:</strong> ${ppl.photo ? '<a href="' + ppl.photo + '" target="_blank">View profile photo 📷</a>' : 'Not available'}</div>
        <div class="phonelookup-row"><strong>LinkedIn:</strong> ${ppl.linkedin ? '<a href="' + ppl.linkedin + '" target="_blank">LinkedIn profile 🔗</a>' : 'Not found'}</div>
      `,
      textContent: `Name: ${ppl.name}\nEmail: ${ppl.email}\nOrg: ${ppl.organization}`
    });
  }

  // If no data
  if (sections.length === 0) {
    resultsWrap.innerHTML = '<div class="phonelookup-error">No data found for this phone number.</div>';
    return;
  }

  // Render sections
  sections.forEach((sec, idx) => {
    const sectionDiv = document.createElement('div');
    sectionDiv.className = 'phonelookup-section';

    const headerDiv = document.createElement('div');
    headerDiv.className = 'phonelookup-section-header';
    headerDiv.textContent = sec.title;
    headerDiv.style.cursor = 'pointer';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'phonelookup-section-content';
    contentDiv.innerHTML = sec.content;
    contentDiv.style.display = idx === 0 ? 'block' : 'none';

    headerDiv.addEventListener('click', () => {
      contentDiv.style.display = contentDiv.style.display === 'none' ? 'block' : 'none';
      headerDiv.classList.toggle('expanded');
    });

    sectionDiv.appendChild(headerDiv);
    sectionDiv.appendChild(contentDiv);
    resultsWrap.appendChild(sectionDiv);

    // Build text for copy
    resultText += `${sec.title}\n${'-'.repeat(60)}\n${sec.textContent}\n\n`;
  });

  phoneLookupState.results.text = resultText;
}

async function phoneLookupBrowserFallback(phoneNumber) {
  // In browser mode, return a placeholder response
  console.log('Using browser fallback for phone lookup');
  return {
    error: 'Phone lookup requires backend API keys. Use NumVerify, OpenCellID, and Google People APIs.',
    numverify: null,
    opencellid: [],
    people_api: null
  };
}

// Make window draggable
function makeDraggable(titlebar, win) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

  titlebar.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    win.style.top = (win.offsetTop - pos2) + 'px';
    win.style.left = (win.offsetLeft - pos1) + 'px';
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initPhoneLookup();
});
