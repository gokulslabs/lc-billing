type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredInstall: InstallPrompt | null = null;
const installListeners = new Set<() => void>();

function notifyInstall() {
  installListeners.forEach((listener) => listener());
}

export function subscribeInstall(listener: () => void) {
  installListeners.add(listener);
  return () => {
    installListeners.delete(listener);
  };
}

export function appIsInstalled() {
  if (typeof window === "undefined") return false;
  const ios = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || ios.standalone === true;
}

export async function installShopApp(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferredInstall) return "unavailable";
  await deferredInstall.prompt();
  const choice = await deferredInstall.userChoice;
  deferredInstall = null;
  notifyInstall();
  return choice.outcome;
}

export function installHelp() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (ios) return "On iPhone, tap Share, then Add to Home Screen.";
  return "Open this site in Chrome on the phone, then tap Install app.";
}

export function registerShopApp() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstall = event as InstallPrompt;
    notifyInstall();
  });
  window.addEventListener("appinstalled", () => {
    deferredInstall = null;
    notifyInstall();
  });
  const register = () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // The lists still open in the browser when the home-screen app cannot register.
    });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
