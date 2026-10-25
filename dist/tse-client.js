import { states } from './states.js';
const validRegions = new Set(['br', ...states.map(state => state.uf)]);
const abortError = () => new DOMException('Consulta cancelada', 'AbortError');

function pause(ms, signal) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, ms);
    const cancel = () => { clearTimeout(timer); reject(abortError()); };
    signal?.addEventListener('abort', cancel, { once:true });
  });
}

export function createTseClient({ fetchImpl = globalThis.fetch, interval = 300, timeout = 10000, now = Date.now } = {}) {
  let queue = Promise.resolve(), lastStart = 0, blockedUntil = 0;
  const cache = new Map();
  function get(turn, region, { signal, maxAge = 4000 } = {}) {
    if (!['1','2'].includes(String(turn)) || !validRegions.has(region)) return Promise.reject(new Error('Abrangência inválida.'));
    const key = `${turn}/${region}`;
    const execute = async () => {
      if (signal?.aborted) throw abortError();
      if (now() < blockedUntil) throw new Error('O TSE limitou temporariamente as consultas.');
      const saved = cache.get(key);
      if (saved && now() - saved.at < maxAge) return saved.data;
      await pause(Math.max(0, interval - (now() - lastStart)), signal);
      if (signal?.aborted) throw abortError();
      if (now() < blockedUntil) throw new Error('O TSE limitou temporariamente as consultas.');
      const controller = new AbortController();
      const cancel = () => controller.abort();
      signal?.addEventListener('abort', cancel, { once:true });
      const timer = setTimeout(cancel, timeout);
      lastStart = now();
      const id = String(turn) === '1' ? '6257' : '6258';
      const url = `https://resultados.tse.jus.br/oficial/ele2026/${id}/dados/${region}/${region}-c0001-e${id.padStart(6,'0')}-u.json`;
      try {
        const response = await fetchImpl(url, { cache:'no-cache', signal:controller.signal });
        if ([403,429].includes(response.status)) {
          const retry=Number(response.headers?.get('Retry-After'));
          blockedUntil=now()+Math.max(600000,Number.isFinite(retry)&&retry>0?retry*1000:0);
        }
        if (!response.ok) throw new Error(`TSE indisponível (HTTP ${response.status}).`);
        const data = await response.json();
        cache.set(key, { data, at:now() });
        return data;
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
    };
    const task = queue.then(execute);
    queue = task.catch(() => {});
    return task;
  }
  return { get, retryAfter:() => Math.max(0, Math.ceil((blockedUntil - now()) / 1000)) };
}
export const tseClient = createTseClient();
