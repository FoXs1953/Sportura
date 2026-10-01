import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";
const storageKey = "sportura-theme";
const changeEvent = "sportura-theme-change";

// Apply the saved theme before the page paints, including on SSR pages.
export const themeScript = `(() => {
  let theme = "light";
  try { if (localStorage.getItem("${storageKey}") === "dark") theme = "dark"; } catch {}
  document.documentElement.classList.toggle("light", theme === "light");
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#ffffff" : "#111617");
})();`;

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("light", theme === "light");
  document.documentElement.classList.toggle("dark", theme === "dark");
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "light" ? "#ffffff" : "#111617");
  window.dispatchEvent(new Event(changeEvent));
}

function subscribe(onChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key === storageKey || event.key === null) {
      applyTheme(event.newValue === "dark" ? "dark" : "light");
    }
  }
  window.addEventListener(changeEvent, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(changeEvent, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useTheme() {
  const theme = useSyncExternalStore(
    subscribe,
    (): Theme =>
      document.documentElement.classList.contains("dark") ? "dark" : "light",
    (): Theme => "light",
  );

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    try {
      localStorage.setItem(storageKey, nextTheme);
    } catch {
      // Switching still works when browser storage is unavailable.
    }
  }

  return { theme, toggleTheme };
}
