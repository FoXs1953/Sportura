import { useI18n } from "@/lib/i18n";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";
export function ThemeToggle() {
  const { tr } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const label =
    theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему";
  return (
    <button
      type="button"
      className="feed-theme-toggle"
      onClick={toggleTheme}
      aria-label={tr(label)}
      title={tr(label)}
    >
      <Sun className="theme-icon-sun" size={20} aria-hidden="true" />
      <Moon className="theme-icon-moon" size={20} aria-hidden="true" />
    </button>
  );
}
