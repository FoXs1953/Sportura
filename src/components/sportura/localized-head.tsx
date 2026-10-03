import { Asset, useRouter, useTags } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";

/** Keep TanStack's deduplication, preload tags and CSP nonce while localizing metadata. */
export function LocalizedHead() {
  const tags = useTags();
  const router = useRouter();
  const { tr, language } = useI18n();
  const localizeTitle = (title: string) => {
    const translated = tr(title);
    if (translated !== title) return translated;
    return title.endsWith(" — Sportura")
      ? `${tr(title.slice(0, -11))} — Sportura`
      : translated;
  };
  return (
    <>
      {tags.map((tag) => {
        const localized = { ...tag };
        if (tag.tag === "title" && typeof tag.children === "string")
          localized.children = localizeTitle(tag.children);
        if (tag.tag === "meta" && typeof tag.attrs?.["content"] === "string") {
          localized.attrs = {
            ...tag.attrs,
            content: localizeTitle(tag.attrs["content"])
              .split(" · ")
              .map((part) => tr(part))
              .join(" · "),
          };
        }
        if (tag.tag === "link" && tag.attrs?.["rel"] === "manifest") {
          localized.attrs = {
            ...tag.attrs,
            href:
              language === "ru"
                ? "/manifest.ru.webmanifest"
                : "/manifest.webmanifest",
          };
        }
        return (
          <Asset
            {...localized}
            key={`tsr-meta-${JSON.stringify(localized)}`}
            {...(router.options.ssr?.nonce
              ? { nonce: router.options.ssr.nonce }
              : {})}
          />
        );
      })}
    </>
  );
}
