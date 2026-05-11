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
      fields: ['ImageDescription', 'Make', 'Model', 'Orientation', 'XResolution', 'YResolution', 'ResolutionUnit', 'Software', 'DateTime', 'Artist', 'Copyright', 'HostComputer', 'XPAuthor', 'XPComment', 'XPKeywords', 'XPSubject', 'XPTitle', 'SamplesPerPixel', 'RowsPerStrip', 'PlanarConfig', 'Predictor', 'WhitePoint', 'PrimaryChromaticities', 'ExposureTime', 'FNumber', 'ExposureProgram', 'ISO', 'ExifVersion', 'DateTimeOriginal', 'DateTimeDigitized', 'SubSecTime', 'SubSecTimeOriginal', 'SubSecTimeDigitized', 'ShutterSpeedValue', 'ApertureValue', 'BrightnessValue', 'MaxApertureValue', 'ExposureBias', 'SubjectDistance', 'SubjectDistanceRange', 'MeteringMode', 'LightSource', 'Flash', 'FocalLength', 'SubjectArea', 'MakerNote', 'FlashPixVersion', 'ColorSpace', 'PixelWidth', 'PixelHeight', 'CustomRendered', 'ExposureMode', 'WhiteBalance', 'DigitalZoomRatio', 'FocalLength35mm', 'SceneCaptureType', 'Contrast', 'Saturation', 'Sharpness', 'GainControl', 'SubjectLocation', 'ExposureIndex', 'SensingMethod', 'FileSource', 'SceneType', 'ImageUniqueID', 'CameraOwnerName', 'BodySerialNumber', 'LensSpecification', 'LensMake', 'LensModel', 'LensSerialNumber', 'Gamma', 'FocalPlaneXResolution', 'FocalPlaneYResolution', 'FocalPlaneResUnit', 'UserComment'],
    },
    {
      section: 'GPS',
      fields: ['LatitudeRef', 'Latitude', 'LongitudeRef', 'Longitude', 'AltitudeRef', 'SpeedRef', 'ImgDirectionRef', 'MapDatum', 'DateStamp', 'LatitudeDecimal', 'LongitudeDecimal', 'Altitude', 'Speed', 'ImgDirection', 'TimeStampUTC', 'Coordinates', 'MapLink', 'Satellites', 'Status', 'MeasureMode', 'DOP', 'TrackRef', 'Track', 'DestLatitudeRef', 'DestLatitude', 'DestLongitudeRef', 'DestLongitude', 'DestBearingRef', 'DestBearing', 'DestDistanceRef', 'DestDistance', 'GPSProcessingMethod', 'GPSAreaInformation', 'Differential', 'HPositioningError'],
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
      fields: ['ObjectName', 'EditStatus', 'Urgency', 'Category', 'Supplemental', 'FixtureId', 'Keywords', 'ContentLocationCode', 'ContentLocationName', 'ReleaseDate', 'ReleaseTime', 'ExpirationDate', 'ExpirationTime', 'SpecialInstruction', 'ActionAdvised', 'ReferenceService', 'ReferenceDate', 'ReferenceNumber', 'DateCreated', 'TimeCreated', 'DigitalCreationDate', 'DigitalCreationTime', 'OriginatingProgram', 'ProgramVersion', 'ObjectCycle', 'ByLine', 'ByLineTitle', 'WriterEditor', 'City', 'SubLocation', 'Province', 'CountryCode', 'CountryName', 'Contact', 'TransmissionRef', 'Headline', 'Credit', 'Source', 'ImageType', 'ImageOrientation', 'LanguageIdentifier', 'Title', 'Description', 'Creator', 'Subject', 'Rights', 'CreateDate', 'ModifyDate', 'MetadataDate', 'CreatorTool', 'Rating', 'Caption', 'CaptionWriter', 'UsageTerms', 'DocumentID', 'OriginalDocumentID', 'InstanceID', 'XmpColorMode', 'XmpICCProfile', 'XmpHeadline', 'Instructions', 'TransmissionReference', 'XmpUrgency', 'XmpCity', 'XmpState', 'XmpCountry', 'IptcLocation', 'IptcCountryCode', 'Scene', 'SubjectCode', 'WebStatement', 'RightsMarked', 'AuthorsPosition', 'XmpByline', 'XmpBylineTitle', 'XmpCaption'],
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
    'SamplesPerPixel', 'RowsPerStrip', 'PlanarConfig', 'Predictor', 'WhitePoint', 'PrimaryChromaticities',
    'BrightnessValue', 'MaxApertureValue', 'SubjectDistance', 'SubjectArea', 'SubjectDistanceRange', 'MakerNote',
    'GainControl', 'SubjectLocation', 'ExposureIndex', 'SensingMethod', 'FileSource', 'SceneType',
    'SubSecTime', 'SubSecTimeOriginal', 'SubSecTimeDigitized',
    'FocalPlaneXResolution', 'FocalPlaneYResolution', 'FocalPlaneResUnit',
    'LensSpecification', 'Gamma', 'BodySerialNumber',
    'Satellites', 'Status', 'MeasureMode', 'DOP', 'TrackRef', 'Track',
    'DestLatitudeRef', 'DestLatitude', 'DestLongitudeRef', 'DestLongitude',
    'DestBearingRef', 'DestBearing', 'DestDistanceRef', 'DestDistance',
    'GPSProcessingMethod', 'GPSAreaInformation', 'Differential', 'HPositioningError',
    'DocumentID', 'OriginalDocumentID', 'InstanceID', 'XmpColorMode', 'XmpICCProfile',
    'Scene', 'SubjectCode', 'ContentLocationCode', 'IptcCountryCode',
    'ImageType', 'ImageOrientation', 'LanguageIdentifier', 'ObjectCycle', 'ActionAdvised',
    'ReferenceService', 'ReferenceDate', 'ReferenceNumber',
  ]);

  const IMG_META_HINTS = {
    Filename: 'Original file name.',
    MimeType: 'Declared file MIME type.',
    FileSize: 'Size of the file on disk.',
    LastModifiedUnix: 'Last modified timestamp (Unix).',
    LastModifiedLocal: 'Last modified timestamp (local time).',
    LastModifiedUTC: 'Last modified timestamp (UTC).',
    DataReceived: 'How many bytes were analyzed.',
    Extension: 'File extension from name.',
    Format: 'Detected image format from signature.',
    MagicBytes: 'First bytes of file header (signature).',
    Width: 'Image width in pixels.',
    Height: 'Image height in pixels.',
    BitDepth: 'Bits used per channel or sample.',
    BitsPerPixel: 'Total bits per pixel.',
    ColorMode: 'Color model used by image data.',
    ColorType: 'PNG color type / channel layout.',
    Components: 'Number of image components/channels.',
    Interlace: 'Interlace mode used by image format.',
    Orientation: 'How the image should be rotated/flipped.',
    Software: 'Software that saved or edited the file.',
    DateTime: 'Generic EXIF date/time (often last metadata write).',
    DateTimeOriginal: 'When the image was originally created.',
    DateTimeDigitized: 'When image was digitized by device.',
    ModifyDate: 'XMP metadata modification time.',
    MetadataDate: 'XMP metadata package update time.',
    Artist: 'Author/artist from EXIF.',
    Creator: 'Creator from XMP.',
    ByLine: 'Photographer/creator from IPTC.',
    XPAuthor: 'Author from Windows XP EXIF tag.',
    CameraOwnerName: 'Camera owner name from EXIF.',
    WriterEditor: 'Writer/editor from IPTC.',
    CaptionWriter: 'Caption writer from XMP/Photoshop.',
    OriginatingProgram: 'Program that created IPTC metadata.',
    ProgramVersion: 'Version of originating IPTC program.',
    CreatorTool: 'Tool/app used to create metadata.',
    Copyright: 'Copyright statement.',
    Rights: 'Rights/license statement from XMP.',
    UsageTerms: 'Usage terms from XMP rights metadata.',
    Credit: 'Credit line (who to credit).',
    Source: 'Original source/publication.',
    UserComment: 'User-supplied comment from EXIF.',
    ImageDescription: 'Short description of the image.',
    Title: 'Title of the image/document.',
    Description: 'Longer description/caption.',
    Subject: 'Keywords/topics assigned to image.',
    Keywords: 'IPTC keywords/tags.',
    Latitude: 'GPS latitude in degrees/minutes/seconds.',
    Longitude: 'GPS longitude in degrees/minutes/seconds.',
    LatitudeDecimal: 'GPS latitude in decimal degrees.',
    LongitudeDecimal: 'GPS longitude in decimal degrees.',
    Altitude: 'GPS altitude.',
    Coordinates: 'Combined decimal latitude/longitude.',
    MapLink: 'Open coordinates on map service.',
    ExposureTime: 'Camera exposure time (shutter).',
    FNumber: 'Aperture (f-stop).',
    ISO: 'Sensor ISO sensitivity.',
    FocalLength: 'Lens focal length.',
    WhiteBalance: 'White balance mode used by camera.',
    Flash: 'Flash fired state.',
    XPComment: 'Comment from Windows XP EXIF tag.',
    XPKeywords: 'Keywords from Windows XP EXIF tag.',
    XPSubject: 'Subject from Windows XP EXIF tag.',
    XPTitle: 'Title from Windows XP EXIF tag.',
    SamplesPerPixel: 'Number of components per pixel (TIFF).',
    RowsPerStrip: 'Number of rows per TIFF strip.',
    PlanarConfig: 'How color components are stored (TIFF).',
    Predictor: 'Compression predictor type (TIFF/LZW).',
    WhitePoint: 'Chromaticity of white point (CIE xy).',
    PrimaryChromaticities: 'Chromaticities of primary colors (CIE xy pairs).',
    BrightnessValue: 'Luminance of the scene in APEX units.',
    MaxApertureValue: 'Smallest lens f-number in APEX.',
    SubjectDistance: 'Distance from camera to subject.',
    SubjectArea: 'Location and area of main subject in image.',
    SubjectDistanceRange: 'Distance to the subject category.',
    MakerNote: 'Manufacturer-specific metadata block.',
    SubSecTime: 'Sub-second time for DateTime.',
    SubSecTimeOriginal: 'Sub-second time for DateTimeOriginal.',
    SubSecTimeDigitized: 'Sub-second time for DateTimeDigitized.',
    GainControl: 'Degree of overall image gain adjustment.',
    SubjectLocation: 'Location of main subject in pixels.',
    ExposureIndex: 'Exposure index selected on camera.',
    SensingMethod: 'Image sensor type.',
    FileSource: 'Source device type.',
    SceneType: 'Type of scene (directly photographed etc.).',
    FocalPlaneXResolution: 'Horizontal pixels per focal plane resolution unit.',
    FocalPlaneYResolution: 'Vertical pixels per focal plane resolution unit.',
    FocalPlaneResUnit: 'Unit for focal plane resolution values.',
    BodySerialNumber: 'Camera body serial number.',
    LensSpecification: 'Min/max focal length and aperture of lens.',
    LensMake: 'Lens manufacturer.',
    LensModel: 'Lens model name.',
    LensSerialNumber: 'Lens serial number.',
    Gamma: 'Gamma value of image data.',
    Satellites: 'GPS satellites used for measurement.',
    Status: 'GPS receiver status (A=active, V=void).',
    MeasureMode: 'GPS measurement mode (2D or 3D).',
    DOP: 'GPS Degree of Precision (DOP).',
    TrackRef: 'Reference for GPS track direction.',
    Track: 'Direction of GPS movement.',
    DestLatitudeRef: 'Reference for GPS destination latitude.',
    DestLatitude: 'GPS latitude of destination.',
    DestLongitudeRef: 'Reference for GPS destination longitude.',
    DestLongitude: 'GPS longitude of destination.',
    DestBearingRef: 'Reference for GPS bearing to destination.',
    DestBearing: 'Bearing to GPS destination.',
    DestDistanceRef: 'Unit for GPS distance to destination.',
    DestDistance: 'Distance to GPS destination.',
    GPSProcessingMethod: 'Name of GPS processing method.',
    GPSAreaInformation: 'Name of GPS area.',
    Differential: 'Whether GPS differential correction was applied.',
    HPositioningError: 'Horizontal GPS positioning error.',
    Urgency: 'IPTC editorial urgency (1=most urgent).',
    ContentLocationCode: 'ISO 3166 code for content location.',
    ContentLocationName: 'Name of content location.',
    ExpirationDate: 'Date after which content should not be used.',
    ExpirationTime: 'Time after which content should not be used.',
    ActionAdvised: 'Action intended for object (IPTC).',
    ReferenceService: 'Service of related object (IPTC).',
    ReferenceDate: 'Date of related object (IPTC).',
    ReferenceNumber: 'Envelope number of related object (IPTC).',
    ObjectCycle: 'Part of day for distribution (a/p/b).',
    Contact: 'Person to contact for editorial info.',
    ImageType: 'IPTC image type code.',
    ImageOrientation: 'IPTC image orientation (P/L/S).',
    LanguageIdentifier: 'Two-letter language code of content.',
    DocumentID: 'XMP document unique identifier.',
    OriginalDocumentID: 'XMP original document identifier.',
    InstanceID: 'XMP unique instance identifier.',
    XmpColorMode: 'Photoshop color mode from XMP.',
    XmpICCProfile: 'ICC profile name from XMP/Photoshop.',
    XmpHeadline: 'Headline from XMP Photoshop namespace.',
    Instructions: 'Special handling instructions (XMP).',
    TransmissionReference: 'Original transmission reference (XMP).',
    XmpUrgency: 'Editorial urgency from XMP Photoshop.',
    XmpCity: 'City from XMP Photoshop namespace.',
    XmpState: 'State/province from XMP Photoshop namespace.',
    XmpCountry: 'Country from XMP Photoshop namespace.',
    IptcLocation: 'Location from IPTC Core XMP.',
    IptcCountryCode: 'Country code from IPTC Core XMP.',
    Scene: 'IPTC scene code from XMP.',
    SubjectCode: 'IPTC subject reference code from XMP.',
    WebStatement: 'URL of rights statement from XMP.',
    RightsMarked: 'Whether content is rights-managed (XMP).',
    AuthorsPosition: 'Job title of author (Photoshop XMP).',
    XmpByline: 'Byline from Photoshop XMP.',
    XmpBylineTitle: 'Byline title from Photoshop XMP.',
    XmpCaption: 'Caption from Photoshop XMP.',
  };

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

  function getMetaHint(key) {
    const k = String(key || '').trim();
    if (!k) return 'Metadata field.';
    if (IMG_META_HINTS[k]) return IMG_META_HINTS[k];
    if (k.includes('Date') || k.includes('Time')) return 'Date/time metadata field.';
    if (k.includes('Author') || k.includes('Creator') || k.includes('Artist') || k.includes('Owner')) return 'Author/creator related metadata.';
    if (k.includes('GPS') || k.includes('Latitude') || k.includes('Longitude') || k.includes('Altitude')) return 'Location metadata from GPS.';
    if (k.includes('Copyright') || k.includes('Rights') || k.includes('Credit') || k.includes('Usage')) return 'Copyright/rights metadata.';
    return `Metadata field: ${k}`;
  }

  function renderValueCell(e) {
    const key = String(e.key || '');
    const value = String(e.value || '');
    const hint = escAttr(getMetaHint(key));
    if (isEditableEntry(e)) {
      return `<input class="imgmeta-value-input" data-entry-section="${escAttr(e.section)}" data-entry-key="${escAttr(e.key)}" value="${escAttr(value)}" spellcheck="false" title="${hint}">`;
    }
    if (key === 'MapLink' && /^https?:\/\//i.test(value)) {
      const safe = escHtml(value);
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer" title="${hint}">${safe}</a>`;
    }
    return `<span title="${hint}">${escHtml(value)}</span>`;
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
      const rows = (bySection.get(sec) || []).map(e => {
        const hint = escAttr(getMetaHint(e.key));
        return `<tr class="${isEditableEntry(e) ? 'imgmeta-row-editable' : 'imgmeta-row-readonly'}">
          <td class="imgmeta-col-key" title="${hint}">${escHtml(e.key)}</td>
          <td class="imgmeta-col-value" title="${hint}">${renderValueCell(e)}</td>
        </tr>`;
      }).join('');
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
      const items = group.fields
        .map(f => `<li title="${escAttr(getMetaHint(f))}">${escHtml(f)}</li>`)
        .join('');
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
