function showExternalIpConfirm(startIp, endIp) {
  return new Promise(resolve => {
    const overlay = document.getElementById('dlgExternalIpOverlay');
    document.getElementById('dlgExternalIpMsg').innerHTML = t('dlgExternalIpMsg', startIp, endIp);
    overlay.classList.add('open');
    if (typeof bringToFront === 'function') bringToFront(overlay.querySelector('.dlg95'));
    const cleanup = (result) => {
      overlay.classList.remove('open');
      document.getElementById('btnExtIpOk').removeEventListener('click', onOk);
      document.getElementById('btnExtIpCancelBtn').removeEventListener('click', onCancel);
      document.getElementById('btnExtIpCancel').removeEventListener('click', onCancel);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    document.getElementById('btnExtIpOk').addEventListener('click', onOk);
    document.getElementById('btnExtIpCancelBtn').addEventListener('click', onCancel);
    document.getElementById('btnExtIpCancel').addEventListener('click', onCancel);
  });
}

function showLargeRangeConfirm(count, customMessage) {
  return new Promise(resolve => {
    const overlay = document.getElementById('dlgLargeRangeOverlay');
    const msg = document.getElementById('dlgLargeRangeMsg');
    msg.textContent = (typeof customMessage === 'string' && customMessage.trim())
      ? customMessage
      : t('dlgLargeRangeMsg', count.toLocaleString());
    overlay.classList.add('open');
    if (typeof bringToFront === 'function') bringToFront(overlay.querySelector('.dlg95'));
    const cleanup = (result) => {
      overlay.classList.remove('open');
      document.getElementById('btnLargeRangeOk').removeEventListener('click', onOk);
      document.getElementById('btnLargeRangeCancelBtn').removeEventListener('click', onCancel);
      document.getElementById('btnLargeRangeCancel').removeEventListener('click', onCancel);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    document.getElementById('btnLargeRangeOk').addEventListener('click', onOk);
    document.getElementById('btnLargeRangeCancelBtn').addEventListener('click', onCancel);
    document.getElementById('btnLargeRangeCancel').addEventListener('click', onCancel);
  });
}

function showFullPortScanConfirm(ip) {
  const target = ip || 'selected host';
  return Promise.resolve(window.confirm([
    'Full port scan warning',
    '',
    `You are about to scan all 65535 TCP ports on ${target}.`,
    'This may take a long time and can trigger IDS/IPS alerts.',
    '',
    'Continue?'
  ].join('\n')));
}
