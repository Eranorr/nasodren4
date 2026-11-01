/* =====================================================================
   NS4-18: oyun sonu global gönderim paneli. Skor yalnızca kullanıcı
   "Global tabloya gönder" dediğinde ağa gider (otomatik gönderim yok).
   Durumlar: hazır → gönderiliyor → gönderildi / hata. Başarılı oyun tekrar
   gönderilemez (yerel kayıtta işaretlenir). Ağ hatası oyunu ve yerel kaydı
   etkilemez; kullanıcı tekrar deneyebilir. Gönderilince tablodaki sıra
   gösterilir ve Skorlar ekranında kendi satırı vurgulanır.
   ===================================================================== */
import { $ } from './dom';
import { track } from '../analytics/analytics';
import type { SubmitFailCode } from '../types/analytics';
import { validateNickname } from '../../supabase/functions/_shared/scoreRules.ts';
import type { GlobalEntry, LeaderboardClient, SubmitResult } from '../leaderboard/globalClient';
import type { LocalScore } from '../leaderboard/localScores';

export const SUBMIT_TEXT = {
  sending: 'Gönderiliyor…',
  sent: 'Global tabloya gönderildi',
  /** {n}: tablodaki sıra. */
  sentRank: 'Global tabloya gönderildi · Sıran: {n}.',
  duplicate: 'Bu oyun zaten gönderilmiş',
  invalidNick: 'Takma ad geçersiz',
  rejected: 'Bu skor gönderilemedi',
  rate: 'Çok sık gönderim, biraz sonra tekrar dene',
  failed: 'Gönderilemedi, tekrar dene',
  disabled: 'Global tablo çevrimdışı',
} as const;

export type SubmitState = 'idle' | 'sending' | 'sent' | 'failed' | 'disabled';

/** İstemci sonucu → analitik hata kodu (sabit küme). */
const FAIL_CODE: Readonly<Record<Exclude<SubmitResult, { ok: true }>['reason'], SubmitFailCode>> = {
  disabled: 'disabled',
  invalid: 'rejected',
  duplicate: 'duplicate',
  rate_limited: 'rate_limited',
  offline: 'offline',
  timeout: 'timeout',
  error: 'server',
};

export interface SubmitPanelDeps {
  readonly client: LeaderboardClient;
  readonly loadNickname: () => string;
  readonly saveNickname: (n: string) => void;
  readonly updateLocal: (id: string, patch: { nickname?: string; submitted?: boolean }) => void;
  /** Gönderilen satır (Skorlar ekranında vurgulanır; ilk 10'da değilse sırasıyla altta). */
  readonly onSubmitted?: (entry: GlobalEntry) => void;
}
export interface SubmitPanel {
  /** Yeni oyun sonu: paneli bu oyun için hazırlar. */
  prepare(entry: LocalScore): void;
  submit(): Promise<void>;
  readonly state: () => SubmitState;
}

export function createSubmitPanel({
  client,
  loadNickname,
  saveNickname,
  updateLocal,
  onSubmitted,
}: SubmitPanelDeps): SubmitPanel {
  const form = $('submit-score');
  const input = $('nick-input', HTMLInputElement);
  const button = $('b-submit', HTMLButtonElement);
  const status = $('submit-status');
  let entry: LocalScore | null = null;
  let state: SubmitState = 'idle';
  /** Gönderilmiş oyun kimlikleri (bu oturum; yerel liste dışına düşen oyunlar için de). */
  const sentIds = new Set<string>();

  function set(s: SubmitState, text: string): void {
    state = s;
    status.textContent = text;
    form.dataset['state'] = s;
    const locked = s === 'sending' || s === 'sent' || s === 'disabled';
    button.disabled = locked;
    input.disabled = s === 'sent' || s === 'disabled';
    button.setAttribute('aria-busy', String(s === 'sending'));
  }

  async function submit(): Promise<void> {
    const e = entry;
    if (!e || state === 'sending' || state === 'sent' || state === 'disabled') return;
    // NS4-19: deneme / sonuç olayları; takma ad, skor veya gövde analitiğe yazılmaz
    track('score_submit_started', {});
    const nick = validateNickname(input.value);
    if (!nick.ok) {
      track('score_submit_failed', { code: 'nickname' });
      input.setAttribute('aria-invalid', 'true');
      set('failed', SUBMIT_TEXT.invalidNick);
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    input.value = nick.value;
    saveNickname(nick.value);
    updateLocal(e.id, { nickname: nick.value });
    set('sending', SUBMIT_TEXT.sending);
    let r: SubmitResult;
    try {
      r = await client.submit({
        gameId: e.id,
        nickname: nick.value,
        score: e.score,
        lines: e.lines,
        level: e.level,
        durationSeconds: Math.max(1, e.durationSeconds),
      });
    } catch {
      r = { ok: false, reason: 'error' };
    }
    // sunucunun "zaten gönderildi" dediği oyun da gönderilmiş sayılır (aynı oyun ikinci kez gönderilemez)
    if (r.ok || r.reason === 'duplicate') {
      sentIds.add(e.id);
      updateLocal(e.id, { submitted: true });
    }
    if (r.ok) onSubmitted?.(r.entry);
    if (r.ok) track('score_submit_succeeded', {});
    else track('score_submit_failed', { code: FAIL_CODE[r.reason] });
    if (entry !== e) return; // bu arada yeni oyun başladı; panel artık başka oyunu gösteriyor
    if (r.ok)
      set('sent', r.entry.rank > 0 ? SUBMIT_TEXT.sentRank.replace('{n}', String(r.entry.rank)) : SUBMIT_TEXT.sent);
    else if (r.reason === 'duplicate') set('sent', SUBMIT_TEXT.duplicate);
    else if (r.reason === 'disabled') set('disabled', SUBMIT_TEXT.disabled);
    else if (r.reason === 'invalid')
      set('sent', SUBMIT_TEXT.rejected); // sunucu bu skoru kabul etmiyor: tekrar yok
    else if (r.reason === 'rate_limited') set('failed', SUBMIT_TEXT.rate);
    else set('failed', SUBMIT_TEXT.failed);
  }

  form.addEventListener('submit', (ev: Event) => {
    ev.preventDefault();
    void submit();
  });
  input.addEventListener('input', () => input.removeAttribute('aria-invalid'));

  return {
    prepare(e) {
      entry = e;
      input.value = e.nickname || loadNickname();
      input.removeAttribute('aria-invalid');
      if (!client.enabled) set('disabled', SUBMIT_TEXT.disabled);
      else if (e.submitted || sentIds.has(e.id)) set('sent', SUBMIT_TEXT.sent);
      else set('idle', '');
    },
    submit,
    state: () => state,
  };
}
