const MAX_BREADCRUMBS = 40;
const MAX_QUEUE = 30;

function now() {
  return new Date().toISOString();
}

function serializeError(error) {
  if (!error) return { type: 'Error', message: 'Unknown error', stack: '' };
  if (typeof error === 'string') return { type: 'Error', message: error, stack: '' };
  return {
    type: error.name || 'Error',
    message: error.message || String(error),
    stack: error.stack || '',
  };
}

function safeJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return undefined;
  }
}

export function createPulseClient(options = {}) {
  const state = {
    dsn: options.dsn || '',
    environment: options.environment || 'production',
    release: options.release || '',
    user: options.user || {},
    tags: options.tags || {},
    breadcrumbs: [],
    queue: [],
    sending: false,
    installed: false,
  };

  function addBreadcrumb(crumb) {
    state.breadcrumbs.push({
      timestamp: now(),
      type: crumb.type || 'default',
      category: crumb.category || 'custom',
      message: String(crumb.message || '').slice(0, 300),
      data: safeJson(crumb.data) || {},
      level: crumb.level || 'info',
    });
    if (state.breadcrumbs.length > MAX_BREADCRUMBS) {
      state.breadcrumbs.shift();
    }
  }

  async function flush() {
    if (state.sending || !state.dsn || state.queue.length === 0) return;
    state.sending = true;
    const batch = state.queue.splice(0, MAX_QUEUE);
    try {
      for (const event of batch) {
        const payload = JSON.stringify(event);
        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
          const ok = navigator.sendBeacon(state.dsn, new Blob([payload], { type: 'application/json' }));
          if (ok) continue;
        }
        await fetch(state.dsn, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        });
      }
    } catch {
      state.queue.unshift(...batch);
    } finally {
      state.sending = false;
    }
  }

  function captureException(error, extra = {}) {
    const serialized = serializeError(error);
    const event = {
      ...serialized,
      level: extra.level || 'error',
      timestamp: now(),
      url: typeof location !== 'undefined' ? location.href : extra.url || '',
      environment: state.environment,
      release: state.release,
      user: state.user,
      tags: { ...state.tags, ...(extra.tags || {}) },
      breadcrumbs: [...state.breadcrumbs],
      extra: safeJson(extra.extra) || {},
      sdk: '@pulse/sdk@1.0.0',
    };
    addBreadcrumb({ type: 'error', category: 'exception', message: event.message, level: 'error' });
    if (state.queue.length >= MAX_QUEUE) state.queue.shift();
    state.queue.push(event);
    flush();
    return event;
  }

  function captureMessage(message, level = 'info') {
    return captureException({ name: 'Message', message, stack: '' }, { level });
  }

  function install() {
    if (state.installed || typeof window === 'undefined') return;
    state.installed = true;

    window.addEventListener('error', (event) => {
      captureException(event.error || {
        name: 'Error',
        message: event.message,
        stack: `${event.filename}:${event.lineno}:${event.colno}`,
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      captureException(event.reason || { name: 'UnhandledRejection', message: 'Unhandled promise rejection' });
    });

    const origConsoleError = console.error;
    console.error = (...args) => {
      addBreadcrumb({
        type: 'debug',
        category: 'console',
        message: args.map(String).join(' ').slice(0, 300),
        level: 'error',
      });
      origConsoleError.apply(console, args);
    };

    window.addEventListener('click', (event) => {
      const el = event.target;
      if (!el) return;
      const label = el.innerText || el.getAttribute?.('aria-label') || el.tagName;
      addBreadcrumb({
        type: 'user',
        category: 'ui.click',
        message: String(label).replace(/\s+/g, ' ').trim().slice(0, 80),
      });
    }, { capture: true });

    window.addEventListener('pagehide', () => { flush(); });
  }

  return {
    init(next = {}) {
      Object.assign(state, next);
      if (next.dsn) state.dsn = next.dsn;
      install();
      return this;
    },
    captureException,
    captureMessage,
    setUser(user) {
      state.user = user || {};
    },
    setTag(key, value) {
      state.tags[key] = value;
    },
    addBreadcrumb,
    flush,
  };
}

const defaultClient = createPulseClient();

export const init = (options) => defaultClient.init(options);
export const captureException = (...args) => defaultClient.captureException(...args);
export const captureMessage = (...args) => defaultClient.captureMessage(...args);
export const setUser = (...args) => defaultClient.setUser(...args);
export const setTag = (...args) => defaultClient.setTag(...args);
export const addBreadcrumb = (...args) => defaultClient.addBreadcrumb(...args);
export const flush = () => defaultClient.flush();

if (typeof window !== 'undefined') {
  window.Pulse = defaultClient;
}
