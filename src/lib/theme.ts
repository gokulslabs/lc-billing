export const THEME_STORAGE_KEY = "lc-theme";

export type ShopTheme = "light" | "dark";

const THEME_COLORS: Record<ShopTheme, string> = {
  light: "#c44569",
  dark: "#3a1824",
};

export function storedShopTheme(): ShopTheme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyShopTheme(theme: ShopTheme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private browsing can block storage. The class still switches for this visit.
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
}

/** Runs in the document head, before the page paints. */
export const themeBootScript = `(function(){try{if(localStorage.getItem("${THEME_STORAGE_KEY}")==="dark"){document.documentElement.classList.add("dark");var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content","${THEME_COLORS.dark}");}}catch(e){}})();`;
