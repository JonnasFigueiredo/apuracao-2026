import { analyticsConfig } from './analytics-config.js';

let enabled = false;

export function analyticsEndpoint({ siteCode, hostname, doNotTrack, globalPrivacyControl }) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(siteCode || '')) return null;
  if (!hostname || /^(localhost|127(?:\.\d+){3}|\[?::1\]?)$/.test(hostname) || hostname.endsWith('.localhost')) return null;
  if (doNotTrack === '1' || globalPrivacyControl === true) return null;
  return `https://${siteCode}.goatcounter.com/count`;
}

export function initAnalytics() {
  const endpoint = analyticsEndpoint({
    siteCode: analyticsConfig.siteCode,
    hostname: location.hostname,
    doNotTrack: navigator.doNotTrack,
    globalPrivacyControl: navigator.globalPrivacyControl
  });
  if (!endpoint || document.getElementById('goatcounter-script')) return;
  let referrer = '';
  try { if (document.referrer) referrer = new URL(document.referrer).origin; } catch {}
  window.goatcounter = { path: location.pathname, referrer, no_events: true };
  const script = document.createElement('script');
  script.id = 'goatcounter-script';
  script.async = true;
  script.src = 'https://gc.zgo.at/count.js';
  script.dataset.goatcounter = endpoint;
  script.addEventListener('load', () => { enabled = typeof window.goatcounter?.count === 'function'; });
  script.addEventListener('error', () => { enabled = false; });
  document.head.append(script);
  document.getElementById('analyticsNotice').hidden = false;
}

export function trackEvent(path, title) {
  if (!enabled || !/^(uf-(?:br|[a-z]{2})|turno-[12]|atualizacao-manual|abrir-fonte)$/.test(path)) return;
  try { window.goatcounter?.count?.({ path, title, event: true }); } catch {}
}
