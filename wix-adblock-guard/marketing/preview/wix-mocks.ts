// Stand-ins for the Wix SDK so the real dashboard page can render outside
// Wix for screenshots and the demo video. ?plan=premium shows the paid plan.
const premium = new URLSearchParams(location.search).get('plan') === 'premium';

export const dashboard = {
  showToast: ({ message }: { message: string }) => {
    const t = document.createElement('div');
    t.textContent = message;
    t.style.cssText =
      'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:9999;background:#1b9e5a;color:#fff;' +
      'padding:12px 20px;border-radius:8px;font:500 15px/1.4 Madefor,Helvetica,Arial,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.2)';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  },
};

export const appInstances = {
  getAppInstance: async () => ({ instance: { isFree: !premium, instanceId: 'demo' } }),
};

export const embeddedScripts = {
  getEmbeddedScript: async () => {
    throw new Error('404');
  },
  embedScript: async () => ({}),
};
