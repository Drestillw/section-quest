// Обёртка над Telegram WebApp SDK (с запасными вариантами для обычного браузера).
const tg = window.Telegram?.WebApp;
const inTg = !!(tg && tg.initData !== undefined && tg.platform && tg.platform !== 'unknown');
export const TG = {
  tg, inTg,
  user: tg?.initDataUnsafe?.user || null,
  get name() { return this.user?.first_name || 'друг'; },
  ver(v) { try { return tg?.isVersionAtLeast?.(v) ?? false; } catch { return false; } },
  init() {
    if (!tg) return;
    try { tg.ready(); } catch {}
    try { tg.expand(); } catch {}
    try { if (this.ver('6.1')) { tg.setHeaderColor('#0d0b27'); tg.setBackgroundColor('#07061a'); } } catch {}
    try { if (this.ver('7.10')) tg.setBottomBarColor('#07061a'); } catch {}
    try { if (this.ver('7.7')) tg.disableVerticalSwipes(); } catch {}
  },
  impact(style = 'light') { try { if (this.ver('6.1')) tg.HapticFeedback.impactOccurred(style); } catch {} },
  notify(type = 'success') { try { if (this.ver('6.1')) tg.HapticFeedback.notificationOccurred(type); } catch {} },
  select() { try { if (this.ver('6.1')) tg.HapticFeedback.selectionChanged(); } catch {} },
  back: { handler: null },
  showBack(fn) {
    if (!tg?.BackButton || !this.ver('6.1')) return;
    if (this.back.handler) tg.BackButton.offClick(this.back.handler);
    this.back.handler = fn;
    tg.BackButton.onClick(fn);
    tg.BackButton.show();
  },
  hideBack() {
    if (!tg?.BackButton || !this.ver('6.1')) return;
    if (this.back.handler) tg.BackButton.offClick(this.back.handler);
    this.back.handler = null;
    tg.BackButton.hide();
  },
  confirmClose(on) { try { if (this.ver('6.2')) on ? tg.enableClosingConfirmation() : tg.disableClosingConfirmation(); } catch {} },
  openLink(url) { try { tg?.openTelegramLink ? tg.openTelegramLink(url) : window.open(url, '_blank'); } catch {} },
  cloudGet(key) {
    return new Promise((res) => {
      if (!tg?.CloudStorage || !this.ver('6.9')) return res(null);
      try { tg.CloudStorage.getItem(key, (err, v) => res(err ? null : v || null)); } catch { res(null); }
      setTimeout(() => res(null), 2500);
    });
  },
  cloudSet(key, val) {
    try { if (tg?.CloudStorage && this.ver('6.9')) tg.CloudStorage.setItem(key, val, () => {}); } catch {}
  },
};
