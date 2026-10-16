export function createMusic(button, audio) {
  const preference = 'dragondance-music-enabled-v1';
  let enabled = true, started = false, blocked = false;
  try { enabled = localStorage.getItem(preference) !== 'off'; } catch { /* Storage is optional. */ }
  audio.volume = .22;
  function update() {
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', blocked ? '播放音乐 / Play music' : enabled ? '关闭音乐 / Mute music' : '开启音乐 / Unmute music');
    button.classList.toggle('muted', !enabled);
    button.title = blocked ? '点击播放音乐 / Click to play music' : 'Cipher — Kevin MacLeod';
    button.querySelector('span').textContent = enabled ? '音乐 开' : '音乐 关';
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
    start() { started = true; audio.volume = .22; play(); },
    finish() { audio.volume = .12; },
    stop() { started = false; audio.pause(); },
  };
}
