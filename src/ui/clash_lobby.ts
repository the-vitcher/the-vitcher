// The Clash pre-match lobby: host a 3v3/5v5 game or join one from the list,
// with a Join-the-battle shortcut while a match is already running. Own module
// composed by hud.ts (the "new windows are modules" rule): no Hud internals,
// reads/acts only through IWorld (mobaLobby + the moba lobby actions). Shown
// between matches; the match HUD (moba_hud.ts) takes over once seated.
import type { IWorld } from '../world_api';
import { esc } from './esc';
import { t } from './i18n';

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => document.querySelector(sel) as T;

export class ClashLobby {
  private root = $('#clash-lobby');
  private gamesEl = $('#clash-lobby-games');
  private joinLiveBtn = $<HTMLButtonElement>('#clash-join-live');
  private sig = '';

  constructor(private sim: IWorld) {
    $('#clash-host-3')?.addEventListener('click', () => this.sim.mobaCreateGame(3));
    $('#clash-host-5')?.addEventListener('click', () => this.sim.mobaCreateGame(5));
    this.joinLiveBtn?.addEventListener('click', () => this.sim.enterMobaMatch());
    // The list re-renders innerHTML, so actions dispatch via delegation.
    this.gamesEl?.addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!btn) return;
      const id = Number(btn.dataset.game ?? '0');
      if (btn.dataset.act === 'join') this.sim.mobaJoinGame(id);
      else if (btn.dataset.act === 'leave') this.sim.mobaLeaveGame();
      else if (btn.dataset.act === 'start') this.sim.mobaStartGame();
    });
  }

  // Per-frame refresh, called from Hud.update(). Visible only between matches
  // (no match, or the last one ended and this player is browsing for the next).
  update(): void {
    if (!this.root) return;
    const lobby = this.sim.mobaLobby();
    const st = this.sim.mobaState();
    const show = !!lobby && (st === null || st.phase === 'ended');
    if (!show) {
      if (!this.root.hidden) { this.root.hidden = true; this.sig = ''; }
      return;
    }
    if (this.root.hidden) this.root.hidden = false;
    const sig = JSON.stringify(lobby);
    if (sig === this.sig) return;
    this.sig = sig;
    if (this.joinLiveBtn) this.joinLiveBtn.hidden = !lobby.liveMatch;
    this.gamesEl.innerHTML = lobby.games.length === 0
      ? `<div class="clash-lobby-empty">${esc(t('hudChrome.clash.lobbyEmpty'))}</div>`
      : lobby.games.map((g) => {
        const count = t('hudChrome.clash.lobbyPlayers', { joined: String(g.joined), capacity: String(g.capacity) });
        const actions = g.isHost
          ? `<button type="button" data-act="start" data-game="${g.id}">${esc(t('hudChrome.clash.startNow'))}</button>`
            + `<button type="button" data-act="leave" data-game="${g.id}" class="secondary">${esc(t('hudChrome.clash.leave'))}</button>`
          : g.mine
            ? `<button type="button" data-act="leave" data-game="${g.id}" class="secondary">${esc(t('hudChrome.clash.leave'))}</button>`
            : `<button type="button" data-act="join" data-game="${g.id}">${esc(t('hudChrome.clash.join'))}</button>`;
        return `<div class="clash-lobby-row${g.mine ? ' mine' : ''}" role="listitem">
          <span class="clg-host">${esc(t('hudChrome.clash.hostedBy', { name: g.host }))}</span>
          <span class="clg-size">${esc(`${g.teamSize}v${g.teamSize}`)}</span>
          <span class="clg-count">${esc(count)}</span>
          <span class="clg-actions">${actions}</span>
        </div>`;
      }).join('');
  }
}
