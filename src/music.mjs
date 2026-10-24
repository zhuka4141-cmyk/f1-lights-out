import { t } from './i18n.mjs';
export function createMusic(button, audio) {
  const preference = 'dragondance-music-enabled-v1';
  let enabled = true, started = false, blocked = false;
  try { enabled = localStorage.getItem(preference) !== 'off'; } catch { /* Storage is optional. */ }
  audio.volume = .18;
  function update() {
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', blocked ? t('musicPlay') : enabled ? t('musicMute') : t('musicUnmute'));
    button.classList.toggle('muted', !enabled);
    button.title = blocked ? t('musicBlockedTitle') : t('musicTitle');
    button.querySelector('span').textContent = enabled ? t('musicOn') : t('musicOff');
  }
  function play() {
    if (!started || !enabled || document.hidden) return;
    audio.play().then(() => { blocked = false; update(); }).catch(() => {
      if (started && enabled && !document.hidden) { blocked = true; update(); }
    });
  }
  button.addEventListener('click', () => {
    if (blocked) { blocked = false; enabled = true; }
    else enabled = !enabled;
    try { localStorage.setItem(preference, enabled ? 'on' : 'off'); } catch { /* Storage is optional. */ }
    if (enabled) play(); else audio.pause();
    update();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) audio.pause(); else play(); });
  update();
  return {
    start() { started = true; audio.currentTime = 0; audio.volume = .18; play(); },
    finish() { audio.volume = .12; },
    stop() { started = false; audio.pause(); },
  };
}
