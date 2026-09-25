import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getPublicSupabase } from "./supabase-public.server";

export type BlockKind = "hero" | "banner" | "text" | "cards" | "faq" | "cta";

export const BLOCK_KIND_LABEL: Record<BlockKind, string> = {
  hero: "Большой баннер",
  banner: "Полоса-объявление",
  text: "Текстовый блок",
  cards: "Список карточек",
  faq: "Вопрос-ответ",
  cta: "Кнопка-призыв",
};

export const PAGE_LABEL: Record<string, string> = {
  home: "Лента (главная)",
  join: "Вход по коду",
  legal: "Документы",
  profile: "Профиль",
};

export type ContentBlock = {
  id: string;
  page: string;
  kind: string;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
  items: { title?: string; text?: string }[];
  position: number;
  published: boolean;
};

export type GeneralSettings = {
  site_name: string;
  tagline: string;
  announcement: string;
  announcement_enabled: boolean;
  maintenance_mode: boolean;
  maintenance_message: string;
  support_contact: string;
  default_city: string;
};

export type CatalogSettings = { sports: string[]; cities: string[] };

export type BusinessSettings = {
  commission_percent: number;
  free_paid_competitions: number;
  dispute_window_hours: number;
  registrations_enabled: boolean;
  activity_creation_enabled: boolean;
};

export const DEFAULT_GENERAL: GeneralSettings = {
  site_name: "Sportura",
  tagline: "Игры и турниры в Астане",
  announcement: "",
  announcement_enabled: false,
  maintenance_mode: false,
  maintenance_message: "Идут технические работы. Скоро вернёмся.",
  support_contact: "",
  default_city: "Астана",
};

export const DEFAULT_CATALOG: CatalogSettings = {
  sports: ["Футбол", "Мини-футбол", "Баскетбол", "Волейбол"],
  cities: ["Астана"],
};

export const DEFAULT_BUSINESS: BusinessSettings = {
  commission_percent: 10,
  free_paid_competitions: 10,
  dispute_window_hours: 48,
  registrations_enabled: true,
  activity_creation_enabled: true,
};

export type SiteContent = {
  general: GeneralSettings;
  catalog: CatalogSettings;
  business: BusinessSettings;
  blocks: ContentBlock[];
};

/** Public, anon-readable site content: settings + published blocks for one page. */
export const getSiteContent = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z
      .object({ page: z.string().max(40).default("home") })
      .parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<SiteContent> => {
    const supabase = getPublicSupabase();
    const [settings, blocks] = await Promise.all([
      supabase.from("site_settings").select("key, value"),
      supabase
        .from("content_blocks")
        .select("id, page, kind, title, subtitle, body, image_url, cta_label, cta_url, items, position, published")
        .eq("page", data.page)
        .eq("published", true)
        .order("position", { ascending: true }),
    ]);

    const map: Record<string, unknown> = {};
    for (const row of (settings.data ?? []) as { key: string; value: unknown }[]) {
      map[row.key] = row.value;
    }

    return {
      general: { ...DEFAULT_GENERAL, ...((map["general"] as Partial<GeneralSettings>) ?? {}) },
      catalog: { ...DEFAULT_CATALOG, ...((map["catalog"] as Partial<CatalogSettings>) ?? {}) },
      business: { ...DEFAULT_BUSINESS, ...((map["business"] as Partial<BusinessSettings>) ?? {}) },
      blocks: ((blocks.data ?? []) as unknown as ContentBlock[]).map((b) => ({
        ...b,
        items: Array.isArray(b.items) ? b.items : [],
      })),
    };
  });
