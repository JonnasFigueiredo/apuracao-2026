import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsEndpoint } from '../dist/analytics.js';

test('somente um código público válido gera um endpoint GoatCounter', () => {
  assert.equal(analyticsEndpoint({ siteCode: 'voto-2026', hostname: 'example.github.io' }), 'https://voto-2026.goatcounter.com/count');
  assert.equal(analyticsEndpoint({ siteCode: '', hostname: 'example.github.io' }), null);
  assert.equal(analyticsEndpoint({ siteCode: 'https://outro.site', hostname: 'example.github.io' }), null);
});

test('desenvolvimento local e preferências de privacidade não geram visitas', () => {
  for (const hostname of ['localhost', '127.0.0.1', '[::1]', 'teste.localhost']) {
    assert.equal(analyticsEndpoint({ siteCode: 'voto-2026', hostname }), null);
  }
  assert.equal(analyticsEndpoint({ siteCode: 'voto-2026', hostname: 'example.github.io', doNotTrack: '1' }), null);
  assert.equal(analyticsEndpoint({ siteCode: 'voto-2026', hostname: 'example.github.io', globalPrivacyControl: true }), null);
});
