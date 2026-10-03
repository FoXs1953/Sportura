import { useI18n } from "@/lib/i18n";

export function LanguageToggle() {
  const { language, setLanguage } = useI18n();
  return (
    <div
      className="feed-language-toggle"
      role="group"
      aria-label={language === "kk" ? "Сайт тілі" : "Язык сайта"}
    >
      <button
        type="button"
        lang="kk"
        aria-label="Қазақ тілі"
        title="Қазақ тілі"
        aria-pressed={language === "kk"}
        onClick={() => setLanguage("kk")}
      >
        ҚАЗ
      </button>
      <button
        type="button"
        lang="ru"
        aria-label="Русский язык"
        title="Русский язык"
        aria-pressed={language === "ru"}
        onClick={() => setLanguage("ru")}
      >
        РУС
      </button>
    </div>
  );
}
