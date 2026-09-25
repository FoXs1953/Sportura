import { z } from "zod";

/** Kazakhstan mobile prefixes in use: 700-778 (Beeline, Kcell, Activ, Tele2, Altel). */
const KZ_MOBILE_PREFIX = /^7(0[0-9]|1[0-8]|2[0-9]|3[0-9]|4[0-9]|5[0-9]|6[0-9]|7[0-8])$/;

/** Turns any user input into the canonical +7XXXXXXXXXX form, or null when unusable. */
export function normalizeKzPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length !== 11 || !digits.startsWith("7")) return null;
  const prefix = digits.slice(1, 4);
  if (!KZ_MOBILE_PREFIX.test(prefix)) return null;
  return `+${digits}`;
}

/** Pretty form for display: +7 701 234 56 78 */
export function formatKzPhone(input: string | null | undefined): string | null {
  const normalized = normalizeKzPhone(input);
  if (!normalized) return null;
  const d = normalized.slice(2);
  return `+7 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8, 10)}`;
}

export const KZ_PHONE_MESSAGE =
  "Укажите мобильный номер Казахстана: +7 700–778 и ещё 7 цифр (например +7 701 234 56 78).";

/** Optional KZ phone: empty stays empty, otherwise must normalize. */
export const kzPhoneSchema = z
  .string()
  .max(32)
  .optional()
  .nullable()
  .transform((v) => (v && v.trim() ? v.trim() : null))
  .refine((v) => v === null || normalizeKzPhone(v) !== null, { message: KZ_PHONE_MESSAGE })
  .transform((v) => (v === null ? null : normalizeKzPhone(v)));

const KASPI_HOSTS = ["pay.kaspi.kz", "kaspi.kz", "www.kaspi.kz"];

export const KASPI_LINK_MESSAGE =
  "Ссылка Kaspi должна начинаться с https://pay.kaspi.kz/pay/... — скопируйте её в приложении Kaspi.";

/** Validates and cleans a personal Kaspi payment link. Returns null when empty. */
export function parseKaspiLink(input: string | null | undefined): string | null {
  if (!input || !input.trim()) return null;
  let raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!KASPI_HOSTS.includes(url.hostname.toLowerCase())) return null;
  if (url.hostname.toLowerCase() === "pay.kaspi.kz" && !url.pathname.startsWith("/pay")) return null;
  url.hash = "";
  return url.toString();
}

export const kaspiLinkSchema = z
  .string()
  .max(500)
  .optional()
  .nullable()
  .transform((v) => (v && v.trim() ? v.trim() : null))
  .refine((v) => v === null || parseKaspiLink(v) !== null, { message: KASPI_LINK_MESSAGE })
  .transform((v) => (v === null ? null : parseKaspiLink(v)));

const TWO_GIS_HOST = /(^|\.)2gis\.(kz|ru|com|ae)$/i;

export const TWO_GIS_MESSAGE =
  "Ссылка на карту должна быть с 2gis.kz — откройте место в 2ГИС и нажмите «Поделиться».";

/** Validates and cleans a 2GIS place link. Returns null when empty. */
export function parseTwoGisLink(input: string | null | undefined): string | null {
  if (!input || !input.trim()) return null;
  let raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!TWO_GIS_HOST.test(url.hostname)) return null;
  url.protocol = "https:";
  url.hash = "";
  return url.toString();
}

export const twoGisLinkSchema = z
  .string()
  .max(500)
  .optional()
  .nullable()
  .transform((v) => (v && v.trim() ? v.trim() : null))
  .refine((v) => v === null || parseTwoGisLink(v) !== null, { message: TWO_GIS_MESSAGE })
  .transform((v) => (v === null ? null : parseTwoGisLink(v)));
