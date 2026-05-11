// ─── Image Metadata Analyzer ─────────────────────────────────────────────────

(function () {
  'use strict';

  const READ_BYTES = 0; // 0 => read full file for maximal metadata coverage

  const IMG_META_FIELD_GROUPS = [
    {
      section: 'File',
      fields: ['Filename', 'MimeType', 'FileSize', 'LastModifiedUnix', 'LastModifiedLocal', 'LastModifiedUTC', 'DataReceived', 'Extension', 'Format', 'MagicBytes'],
    },
    {
      section: 'Image / geometry',
      fields: ['Width', 'Height', 'BitDepth', 'BitsPerSample', 'BitsPerPixel', 'ColorMode', 'ColorType', 'ColorPlanes', 'Components', 'Encoding', 'Interlace', 'GIFVersion', 'Animated', 'FrameCount'],
    },
    {
      section: 'JPEG / JFIF / Adobe',
      fields: ['Version', 'DensityUnit', 'XDensity', 'YDensity', 'Thumbnail', 'DCTEncodeVersion', 'ColorTransform'],
    },
    {
      section: 'EXIF / ExifIFD',
      fields: ['ImageDescription', 'Make', 'Model', 'Orientation', 'XResolution', 'YResolution', 'ResolutionUnit', 'Software', 'DateTime', 'Artist', 'Copyright', 'HostComputer', 'XPAuthor', 'ExposureTime', 'FNumber', 'ExposureProgram', 'ISO', 'ExifVersion', 'DateTimeOriginal', 'DateTimeDigitized', 'ShutterSpeedValue', 'ApertureValue', 'ExposureBias', 'MeteringMode', 'LightSource', 'Flash', 'FocalLength', 'FlashPixVersion', 'ColorSpace', 'PixelWidth', 'PixelHeight', 'CustomRendered', 'ExposureMode', 'WhiteBalance', 'DigitalZoomRatio', 'FocalLength35mm', 'SceneCaptureType', 'Contrast', 'Saturation', 'Sharpness', 'ImageUniqueID', 'CameraOwnerName', 'UserComment'],
    },
    {
      section: 'GPS',
      fields: ['LatitudeRef', 'Latitude', 'LongitudeRef', 'Longitude', 'AltitudeRef', 'SpeedRef', 'ImgDirectionRef', 'MapDatum', 'DateStamp', 'LatitudeDecimal', 'LongitudeDecimal', 'Altitude', 'Speed', 'ImgDirection', 'TimeStampUTC', 'Coordinates', 'MapLink'],
    },
    {
      section: 'PNG',
      fields: ['ColorType', 'LastModified', 'Gamma', 'sRGB', 'ICC Profile', 'XPixelDensity', 'YPixelDensity', 'PixelAspect', 'BackgroundColor', 'Histogram', 'SignificantBits'],
    },
    {
      section: 'GIF / BMP / WebP / PSD / TIFF',
      fields: ['Compression', 'DIBHeaderSize', 'FileSize', 'PixelArrayOffset', 'ImageDataSize', 'XPixelsPerMeter', 'YPixelsPerMeter', 'ColorsUsed', 'GlobalColorTable', 'ColorTableSize', 'ColorResolution', 'BackgroundColorIndex', 'PixelAspectRatio', 'AnimationLoops', 'RIFFSize', 'Subtype', 'Animation', 'EXIF', 'XMP', 'Alpha', 'Channels', 'PhotometricInterp', 'Version', 'BitDepth', 'ColorMode'],
    },
    {
      section: 'IPTC / XMP / Text',
      fields: ['ObjectName', 'EditStatus', 'Category', 'Supplemental', 'FixtureId', 'Keywords', 'ReleaseDate', 'ReleaseTime', 'SpecialInstruction', 'DateCreated', 'TimeCreated', 'DigitalCreationDate', 'DigitalCreationTime', 'OriginatingProgram', 'ProgramVersion', 'ByLine', 'ByLineTitle', 'WriterEditor', 'City', 'SubLocation', 'Province', 'CountryCode', 'CountryName', 'TransmissionRef', 'Headline', 'Credit', 'Source', 'Title', 'Description', 'Creator', 'Subject', 'Rights', 'CreateDate', 'ModifyDate', 'MetadataDate', 'CreatorTool', 'Rating', 'Caption', 'CaptionWriter', 'UsageTerms'],
    },
    {
      section: 'Comment / Color',
      fields: ['Comment', 'ICC Profile'],
    },
  ];

  const NON_EDITABLE_KEYS = new Set([
    'FileSize', 'DataReceived', 'Extension', 'Format', 'MagicBytes', 'LastModifiedUnix', 'LastModifiedLocal', 'LastModifiedUTC',
    'Width', 'Height', 'BitDepth', 'BitsPerSample', 'BitsPerPixel', 'ColorMode', 'ColorType', 'ColorPlanes', 'Components', 'Encoding', 'Interlace', 'GIFVersion', 'Animated', 'FrameCount',
    'Version', 'DensityUnit', 'XDensity', 'YDensity', 'Thumbnail', 'DCTEncodeVersion', 'ColorTransform',
    'XResolution', 'YResolution', 'ResolutionUnit', 'ExposureTime', 'FNumber', 'ExposureProgram', 'ISO', 'ExifVersion', 'DateTimeOriginal', 'DateTimeDigitized', 'ShutterSpeedValue', 'ApertureValue', 'ExposureBias', 'MeteringMode', 'LightSource', 'Flash', 'FocalLength', 'FlashPixVersion', 'ColorSpace', 'PixelWidth', 'PixelHeight', 'CustomRendered', 'ExposureMode', 'WhiteBalance', 'DigitalZoomRatio', 'FocalLength35mm', 'SceneCaptureType', 'Contrast', 'Saturation', 'Sharpness', 'ImageUniqueID',
    'LatitudeDecimal', 'LongitudeDecimal', 'Coordinates', 'MapLink', 'RIFFSize', 'Subtype', 'Animation', 'EXIF', 'XMP', 'Alpha', 'Channels', 'PhotometricInterp', 'PixelArrayOffset', 'ImageDataSize', 'XPixelsPerMeter', 'YPixelsPerMeter', 'ColorsUsed', 'GlobalColorTable', 'ColorTableSize', 'ColorResolution', 'BackgroundColorIndex', 'PixelAspectRatio', 'BackgroundColor', 'Histogram', 'SignificantBits', 'ICC Profile',
  ]);

  let _currentFile = null;
  let _entries     = [];
  let _collapsedSections = new Set();

  // ── Helpers ────────────────────────────────────────────────────────────────

  function t(key, ...args) {
    if (typeof window.T === 'function') return window.T(key, ...args);
    const lang = (typeof window.LANG === 'object' && window.LANG) || {};
    const v = lang[key];
    if (typeof v === 'function') return v(...args);
    return v || key;
  }

  function setStatus(msg) {
    const el = document.getElementById('imgMetaStatus');
    if (el) el.textContent = msg;
  }

  function setStatusEdited() {
    setStatus(t('imgMetaEdited'));
  }

  function formatBytesHuman(n) {
    if (!Number.isFinite(n) || n < 0) return null;
    const kb = n / 1024;
    const mb = kb / 1024;
    return `${n} bytes (${kb.toFixed(2)} KB, ${mb.toFixed(2)} MB)`;
  }

  function parseFirstInt(str) {
    const m = String(str || '').match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  }

  function parseUnixLikeMs(v) {
    const s = String(v || '').trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) {
      const num = Number(s);
      if (!Number.isFinite(num)) return null;
      // Treat large values as ms, smaller as seconds.
      return num > 1e12 ? num : num * 1000;
    }
    // Format from backend: "<sec>.<ms>"
    const m = s.match(/^(\d+)\.(\d{1,3})$/);
    if (!m) return null;
    const sec = Number(m[1]);
    const ms = Number(m[2].padEnd(3, '0'));
    if (!Number.isFinite(sec) || !Number.isFinite(ms)) return null;
    return sec * 1000 + ms;
  }

  function pushOrReplace(entries, section, key, value) {
    const idx = entries.findIndex(e => e.section === section && e.key === key);
    const row = { section, key, value: String(value) };
    if (idx >= 0) entries[idx] = row;
    else entries.push(row);
  }

  function removeEntry(entries, section, key) {
    const idx = entries.findIndex(e => e.section === section && e.key === key);
    if (idx >= 0) entries.splice(idx, 1);
  }

  function findValue(entries, section, key) {
    const e = entries.find(x => x.section === section && x.key === key);
    return e ? String(e.value || '') : '';
  }

  function isEditableEntry(entry) {
    return !NON_EDITABLE_KEYS.has(String(entry.key || ''));
  }

  function escAttr(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/'/g, '&#39;');
  }

  function parseGpsDecimal(value, ref) {
    const raw = String(value || '').trim();
    if (!raw) return null;

    const direct = Number(raw.replace(',', '.'));
    if (Number.isFinite(direct)) {
      return ref === 'S' || ref === 'W' ? -Math.abs(direct) : direct;
    }

    const dms = raw.match(/(-?\d+(?:\.\d+)?)\s*[°ºd]\s*(\d+(?:\.\d+)?)?\s*['’m]?\s*(\d+(?:\.\d+)?)?\s*(?:["”s])?/i);
    if (!dms) return null;

    const deg = Number(dms[1]);
    const min = Number(dms[2] || 0);
    const sec = Number(dms[3] || 0);
    if (!Number.isFinite(deg) || !Number.isFinite(min) || !Number.isFinite(sec)) return null;

    let decimal = Math.abs(deg) + (min / 60) + (sec / 3600);
    const negative = ref === 'S' || ref === 'W' || deg < 0;
    if (negative) decimal = -decimal;
    return decimal;
  }

  function refreshDerivedGps(entries) {
    const latRef = findValue(entries, 'GPS', 'LatitudeRef').trim().toUpperCase();
    const lonRef = findValue(entries, 'GPS', 'LongitudeRef').trim().toUpperCase();
    const latSource = findValue(entries, 'GPS', 'Latitude') || findValue(entries, 'GPS', 'LatitudeDecimal');
    const lonSource = findValue(entries, 'GPS', 'Longitude') || findValue(entries, 'GPS', 'LongitudeDecimal');

    const lat = parseGpsDecimal(latSource, latRef);
    const lon = parseGpsDecimal(lonSource, lonRef);

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      pushOrReplace(entries, 'GPS', 'LatitudeDecimal', lat.toFixed(8));
      pushOrReplace(entries, 'GPS', 'LongitudeDecimal', lon.toFixed(8));
      pushOrReplace(entries, 'GPS', 'Coordinates', `${lat.toFixed(8)}, ${lon.toFixed(8)}`);
      pushOrReplace(entries, 'GPS', 'MapLink', `https://www.openstreetmap.org/?mlat=${lat.toFixed(8)}&mlon=${lon.toFixed(8)}#map=16/${lat.toFixed(8)}/${lon.toFixed(8)}`);
    } else {
      removeEntry(entries, 'GPS', 'Coordinates');
      removeEntry(entries, 'GPS', 'MapLink');
    }
  }

  function enrichEntries(entries, file, bytesRead) {
    const out = (entries || []).map(e => ({
      section: String(e.section || ''),
      key: String(e.key || ''),
      value: String(e.value ?? ''),
    }));

    // 1) Human-readable file size and data read size
    const fileSizeRaw = parseFirstInt(findValue(out, 'File', 'FileSize'));
    if (fileSizeRaw != null) {
      pushOrReplace(out, 'File', 'FileSize', formatBytesHuman(fileSizeRaw));
    } else if (Number.isFinite(file?.size)) {
      pushOrReplace(out, 'File', 'FileSize', formatBytesHuman(file.size));
    }

    const readRaw = parseFirstInt(findValue(out, 'File', 'DataReceived'));
    if (readRaw != null) {
      pushOrReplace(out, 'File', 'DataReceived', formatBytesHuman(readRaw));
    } else if (Number.isFinite(bytesRead)) {
      pushOrReplace(out, 'File', 'DataReceived', formatBytesHuman(bytesRead));
    }

    // 2) Human-readable date/time in local + UTC
    const unixRaw = findValue(out, 'File', 'LastModifiedUnix');
    const unixMs = parseUnixLikeMs(unixRaw);
    const fileMs = Number.isFinite(file?.lastModified) ? file.lastModified : null;
    const tsMs = unixMs ?? fileMs;
    if (Number.isFinite(tsMs)) {
      const d = new Date(tsMs);
      pushOrReplace(out, 'File', 'LastModifiedLocal', d.toLocaleString());
      pushOrReplace(out, 'File', 'LastModifiedUTC', d.toISOString().replace('T', ' ').replace('Z', ' UTC'));
    }

    // 3) Map link from decimal GPS coordinates
    const lat = parseFloat(findValue(out, 'GPS', 'LatitudeDecimal'));
    const lon = parseFloat(findValue(out, 'GPS', 'LongitudeDecimal'));
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      pushOrReplace(out, 'GPS', 'Coordinates', `${lat.toFixed(8)}, ${lon.toFixed(8)}`);
      pushOrReplace(out, 'GPS', 'MapLink', `https://www.openstreetmap.org/?mlat=${lat.toFixed(8)}&mlon=${lon.toFixed(8)}#map=16/${lat.toFixed(8)}/${lon.toFixed(8)}`);
    }

    return out;
  }

  function isTauri() {
    return !!getTauriInvoke();
  }

  function getTauriInvoke() {
    return window.__TAURI_INTERNALS__?.invoke
      ?? window.__TAURI__?.invoke
      ?? window.__TAURI__?.core?.invoke
      ?? null;
  }

  // ── File reading ───────────────────────────────────────────────────────────

  async function analyzeFile(file) {
    _currentFile = file;
    document.getElementById('imgMetaFilename').textContent = file.name;
    _entries = [];
    renderTable([]);
    setStatus(t('imgMetaLoading'));

    const slice = READ_BYTES > 0 ? file.slice(0, READ_BYTES) : file;
    const arrayBuf = await slice.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    const byteArr = Array.from(bytes); // JSON-serializable

    setStatus(t('imgMetaAnalyzing'));

    try {
      let result;
      const invoke = getTauriInvoke();
      if (invoke) {
        result = await invoke('read_image_meta', {
          headerBytes: byteArr,
          filename: file.name,
          mimeType: file.type || null,
          fileSize: Number.isFinite(file.size) ? Math.trunc(file.size) : null,
          lastModifiedUnixMs: Number.isFinite(file.lastModified) ? Math.trunc(file.lastModified) : null,
        });
      } else {
        // Browser-only fallback: basic info only
        result = browserFallbackMeta(file, bytes);
      }

      _entries = enrichEntries(result || [], file, bytes.length);
      renderTable(_entries);

      if (_entries.length === 0) {
        setStatus(t('imgMetaNoMeta'));
      } else {
        setStatus(t('imgMetaDone', _entries.length) + (isTauri() ? '' : '  ' + t('imgMetaDesktopHint')));
      }
    } catch (e) {
      setStatus(t('imgMetaErrRead') + ' ' + (e?.message || e));
    }
  }

  function browserFallbackMeta(file, bytes) {
    const entries = [];
    const push = (sec, key, val) => entries.push({ section: sec, key, value: String(val) });
    push('File', 'Filename', file.name);
    push('File', 'FileSize', file.size + ' bytes');
    push('File', 'Type', file.type || '—');
    push('File', 'LastModified', file.lastModified ? new Date(file.lastModified).toISOString() : '—');
    push('File', 'DataReceived', bytes.length + ' bytes');
    // Magic bytes
    const hex = Array.from(bytes.slice(0, 16)).map(b => b.toString(16).padStart(2,'0').toUpperCase() + ' ').join('').trim();
    push('File', 'MagicBytes', hex);
    const fmt = detectFormat(bytes);
    push('File', 'Format', fmt);
    return entries;
  }

  function detectFormat(bytes) {
    const eq = (off, ...vals) => vals.every((v, i) => bytes[off + i] === v);
    if (eq(0, 0xFF, 0xD8, 0xFF))                                          return 'JPEG';
    if (eq(0, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A))          return 'PNG';
    if (eq(0, 0x47, 0x49, 0x46, 0x38))                                    return 'GIF';
    if (eq(0, 0x42, 0x4D))                                                return 'BMP';
    if (eq(0, 0x52, 0x49, 0x46, 0x46) && eq(8, 0x57, 0x45, 0x42, 0x50)) return 'WebP';
    if (eq(0, 0x49, 0x49, 0x2A, 0x00) || eq(0, 0x4D, 0x4D, 0x00, 0x2A)) return 'TIFF';
    if (eq(0, 0x38, 0x42, 0x50, 0x53))                                    return 'PSD';
    return 'Unknown';
  }

  // ── Table rendering ────────────────────────────────────────────────────────

  function sectionBadge(sec) {
    const cls = 's-' + sec.replace(/[^a-zA-Z]/g, '');
    return `<span class="imgmeta-section-badge ${cls}">${escHtml(sec)}</span>`;
  }

  function sectionKey(sec) {
    return String(sec || '').trim();
  }

  function getOrderedSections(entries) {
    const seen = new Set();
    const ordered = [];

    for (const group of IMG_META_FIELD_GROUPS) {
      const groupSection = sectionKey(group.section);
      if (entries.some(e => sectionKey(e.section) === groupSection) && !seen.has(groupSection)) {
        ordered.push(groupSection);
        seen.add(groupSection);
      }
    }

    for (const entry of entries) {
      const sec = sectionKey(entry.section);
      if (!seen.has(sec)) {
        ordered.push(sec);
        seen.add(sec);
      }
    }

    return ordered;
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function renderValueCell(e) {
    const key = String(e.key || '');
    const value = String(e.value || '');
    if (isEditableEntry(e)) {
      return `<input class="imgmeta-value-input" data-entry-section="${escAttr(e.section)}" data-entry-key="${escAttr(e.key)}" value="${escAttr(value)}" spellcheck="false">`;
    }
    if (key === 'MapLink' && /^https?:\/\//i.test(value)) {
      const safe = escHtml(value);
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>`;
    }
    return escHtml(value);
  }

  function renderTable(entries) {
    const wrap = document.getElementById('imgMetaTableWrap');
    if (!wrap) return;
    if (!entries || entries.length === 0) {
      wrap.innerHTML = '';
      return;
    }

    const bySection = new Map();
    for (const entry of entries) {
      const sec = sectionKey(entry.section);
      if (!bySection.has(sec)) bySection.set(sec, []);
      bySection.get(sec).push(entry);
    }

    const sections = getOrderedSections(entries);
    const bodies = sections.map(sec => {
      const rows = (bySection.get(sec) || []).map(e =>
        `<tr class="${isEditableEntry(e) ? 'imgmeta-row-editable' : 'imgmeta-row-readonly'}">
          <td class="imgmeta-col-key">${escHtml(e.key)}</td>
          <td class="imgmeta-col-value">${renderValueCell(e)}</td>
        </tr>`
      ).join('');
      const collapsed = _collapsedSections.has(sec);
      return `
        <tbody class="imgmeta-group ${collapsed ? 'is-collapsed' : ''}" data-section="${escAttr(sec)}">
          <tr class="imgmeta-group-head">
            <th colspan="3">
              <button type="button" class="imgmeta-group-toggle" data-section="${escAttr(sec)}" aria-expanded="${collapsed ? 'false' : 'true'}">
                <span class="imgmeta-group-toggle-icon">${collapsed ? '+' : '−'}</span>
                <span class="imgmeta-group-toggle-label">${sectionBadge(sec)}</span>
                <span class="imgmeta-group-count">${(bySection.get(sec) || []).length}</span>
              </button>
            </th>
          </tr>
          <tr class="imgmeta-table-headrow">
            <th class="imgmeta-col-key" data-i18n="imgMetaKey">${escHtml(t('imgMetaKey'))}</th>
            <th class="imgmeta-col-value" data-i18n="imgMetaValue">${escHtml(t('imgMetaValue'))}</th>
          </tr>
          ${rows}
        </tbody>`;
    }).join('');

    wrap.innerHTML = `
      <table class="imgmeta-table">
        ${bodies}
      </table>`;
  }

  function renderInfoList() {
    const body = document.getElementById('imgMetaInfoBody');
    if (!body) return;
    const html = IMG_META_FIELD_GROUPS.map(group => {
      const items = group.fields.map(f => `<li>${escHtml(f)}</li>`).join('');
      return `
        <div class="imgmeta-info-section">
          <strong>${escHtml(group.section)}</strong>
          <ul class="imgmeta-info-list">${items}</ul>
        </div>`;
    }).join('');
    body.innerHTML = html;
  }

  function openInfoPopup() {
    const pop = document.getElementById('imgMetaInfoPop');
    if (!pop) return;
    renderInfoList();
    pop.classList.add('is-open');
  }

  function closeInfoPopup() {
    const pop = document.getElementById('imgMetaInfoPop');
    if (!pop) return;
    pop.classList.remove('is-open');
  }

  // ── Export / Copy ──────────────────────────────────────────────────────────

  function buildText() {
    if (!_entries.length) return '';
    const lines = [`Image Metadata — ${_currentFile?.name || ''}\n${'='.repeat(60)}`];
    let lastSec = null;
    for (const e of _entries) {
      if (e.section !== lastSec) { lines.push(`\n[${e.section}]`); lastSec = e.section; }
      lines.push(`  ${e.key.padEnd(26)}${e.value}`);
    }
    return lines.join('\n');
  }

  function onCopy() {
    const txt = buildText();
    if (!txt) return;
    navigator.clipboard.writeText(txt).then(() => setStatus(t('imgMetaCopied')));
  }

  function onExport() {
    const txt = buildText();
    if (!txt) return;
    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (_currentFile?.name || 'image') + '_metadata.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  function onClear() {
    _currentFile = null;
    _entries = [];
    _collapsedSections = new Set();
    closeInfoPopup();
    renderTable([]);
    const fn = document.getElementById('imgMetaFilename');
    if (fn) fn.textContent = '';
    const inp = document.getElementById('imgMetaFileInput');
    if (inp) inp.value = '';
    setStatus(t('imgMetaReady'));
  }

  function onZeroValues() {
    if (!_entries.length) return;
    for (const entry of _entries) {
      if (isEditableEntry(entry)) {
        entry.value = '';
      }
    }
    refreshDerivedGps(_entries);
    renderTable(_entries);
    setStatus(t('imgMetaEdited'));
  }

  function updateEntryValue(section, key, value) {
    const entry = _entries.find(item => item.section === section && item.key === key);
    if (!entry) return;
    entry.value = String(value);
    refreshDerivedGps(_entries);
  }

  function handleTableInput(e) {
    const target = e.target;
    if (!target || !target.classList || !target.classList.contains('imgmeta-value-input')) return;
    const section = target.dataset.entrySection || '';
    const key = target.dataset.entryKey || '';
    updateEntryValue(section, key, target.value);
  }

  function handleTableChange(e) {
    const target = e.target;
    if (!target || !target.classList || !target.classList.contains('imgmeta-value-input')) return;
    const section = target.dataset.entrySection || '';
    const key = target.dataset.entryKey || '';
    updateEntryValue(section, key, target.value);
    renderTable(_entries);
    setStatusEdited();
  }

  function handleGroupToggle(e) {
    const btn = e.target.closest?.('.imgmeta-group-toggle');
    if (!btn) return;
    const section = sectionKey(btn.dataset.section);
    if (!section) return;
    if (_collapsedSections.has(section)) _collapsedSections.delete(section);
    else _collapsedSections.add(section);
    renderTable(_entries);
  }

  // ── Drag & drop ────────────────────────────────────────────────────────────

  function extractFileFromDropEvent(e) {
    const dt = e?.dataTransfer;
    if (!dt) return null;

    if (dt.files && dt.files.length > 0) {
      return dt.files[0] || null;
    }

    if (dt.items && dt.items.length > 0) {
      for (const item of dt.items) {
        if (item && item.kind === 'file') {
          const f = item.getAsFile?.();
          if (f) return f;
        }
      }
    }

    return null;
  }

  function handleDropEvent(e, zone) {
    e.preventDefault();
    e.stopPropagation();
    if (zone) zone.classList.remove('drag-over');

    const file = extractFileFromDropEvent(e);
    if (file) {
      analyzeFile(file);
    } else {
      setStatus(t('imgMetaErrRead'));
    }
  }

  function initDrop() {
    const zone = document.getElementById('imgMetaDropZone');
    if (!zone) return;

    // Prevent WebView from navigating away on file drop.
    document.addEventListener('dragover', e => {
      e.preventDefault();
    });
    document.addEventListener('drop', e => {
      if (!zone.contains(e.target)) {
        handleDropEvent(e, zone);
      }
    });

    zone.addEventListener('dragover', e => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => handleDropEvent(e, zone));
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function openImgMetaDlg() {
    if (typeof _toolMode !== 'undefined' && _toolMode === 'imgmeta') return;
    if (typeof openToolNativeWindow === 'function' && openToolNativeWindow('imgmeta')) return;

    const win = document.getElementById('imgMetaWin');
    if (!win) return;
    win.style.display = 'flex';
    if (!win.style.top) {
      win.style.top = '80px';
      win.style.left = '160px';
    }
    if (typeof bringToFront === 'function') bringToFront(win);
    setStatus(t('imgMetaReady'));
  }

  function closeImgMetaDlg() {
    if (typeof _toolMode !== 'undefined' && _toolMode === 'imgmeta' && typeof closeMainWindow === 'function') {
      closeMainWindow();
      return;
    }

    const win = document.getElementById('imgMetaWin');
    if (win) win.style.display = 'none';
  }

  function initImgMetaEvents() {
    const btnClose = document.getElementById('btnImgMetaClose');
    if (btnClose) btnClose.addEventListener('click', closeImgMetaDlg);

    const btnCopy = document.getElementById('btnImgMetaCopy');
    if (btnCopy) btnCopy.addEventListener('click', onCopy);

    const btnExport = document.getElementById('btnImgMetaExport');
    if (btnExport) btnExport.addEventListener('click', onExport);

    const btnZero = document.getElementById('btnImgMetaZero');
    if (btnZero) btnZero.addEventListener('click', onZeroValues);

    const btnClear = document.getElementById('btnImgMetaClear');
    if (btnClear) btnClear.addEventListener('click', onClear);

    const btnInfo = document.getElementById('btnImgMetaInfo');
    if (btnInfo) btnInfo.addEventListener('click', openInfoPopup);

    const btnInfoClose = document.getElementById('btnImgMetaInfoClose');
    if (btnInfoClose) btnInfoClose.addEventListener('click', closeInfoPopup);

    const fileInput = document.getElementById('imgMetaFileInput');
    if (fileInput) fileInput.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (file) analyzeFile(file);
    });

    const tableWrap = document.getElementById('imgMetaTableWrap');
    if (tableWrap && !tableWrap.dataset.imgmetaHooksInstalled) {
      tableWrap.addEventListener('input', handleTableInput);
      tableWrap.addEventListener('change', handleTableChange);
      tableWrap.addEventListener('click', handleGroupToggle);
      tableWrap.dataset.imgmetaHooksInstalled = '1';
    }

    initDrop();
  }

  window.openImgMetaDlg  = openImgMetaDlg;
  window.closeImgMetaDlg = closeImgMetaDlg;
  window.initImgMetaEvents = initImgMetaEvents;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initImgMetaEvents);
  } else {
    initImgMetaEvents();
  }
})();
