// Mark confirmation, rendered inside a shadow root so YouTube's stylesheet cannot
// reach it and ours cannot leak out.

const HOST_ID = 'laugh-toast-host';
const VISIBLE_MS = 1_600;

let hideTimer: number | undefined;

function ensureHost(): ShadowRoot {
  const existing = document.getElementById(HOST_ID);
  if (existing?.shadowRoot) return existing.shadowRoot;

  const host = document.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    .toast {
      position: fixed;
      right: 24px;
      bottom: 88px;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      border-radius: 10px;
      background: rgba(18, 18, 18, 0.94);
      color: #fff;
      font: 500 14px/1.3 Roboto, Arial, sans-serif;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 140ms ease, transform 140ms ease;
      pointer-events: none;
    }
    .toast.visible { opacity: 1; transform: translateY(0); }
    .toast.error { background: rgba(140, 26, 26, 0.96); }
    .time { color: #9ad; font-variant-numeric: tabular-nums; }
    .streak {
      padding: 1px 7px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.16);
      font-size: 12px;
    }
  `;

  const toast = document.createElement('div');
  toast.className = 'toast';

  shadow.append(style, toast);
  document.body.append(host);
  return shadow;
}

export type ToastOptions = {
  label: string;
  time?: string;
  streak?: number;
  error?: boolean;
};

export function showToast(options: ToastOptions): void {
  // The page can be mid-teardown during an SPA navigation.
  if (!document.body) return;

  const shadow = ensureHost();
  const toast = shadow.querySelector<HTMLElement>('.toast');
  if (!toast) return;

  toast.replaceChildren();
  toast.classList.toggle('error', Boolean(options.error));

  const label = document.createElement('span');
  label.textContent = options.label;
  toast.append(label);

  if (options.time) {
    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = options.time;
    toast.append(time);
  }

  if (options.streak && options.streak > 1) {
    const streak = document.createElement('span');
    streak.className = 'streak';
    streak.textContent = `x${options.streak}`;
    toast.append(streak);
  }

  toast.classList.add('visible');

  if (hideTimer !== undefined) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => toast.classList.remove('visible'), VISIBLE_MS) as unknown as number;
}
