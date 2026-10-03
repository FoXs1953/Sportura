import { russianMessages } from "./ru.ts";
import { kazakhMessages } from "./kk.ts";

export type Language = "kk" | "ru";
export type MessageValues = Record<string, string | number>;
export const defaultLanguage: Language = "kk";
export const languageStorageKey = "sportura-language";
export const localeFor = (language: Language) =>
  language === "kk" ? "kk-KZ" : "ru-RU";
export const normalizeLanguage = (value: unknown): Language =>
  value === "ru" ? "ru" : "kk";

const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const validationFields = new Set([
  "Название",
  "Вид спорта",
  "Город",
  "Организатор",
  "Место",
  "Ссылка 2ГИС",
  "Ссылка Kaspi",
  "Максимум участников",
  "Взнос",
  "Комиссия",
]);
const validationPatterns: [RegExp, string][] = [
  [
    /^Number must be greater than or equal to (\d+)$/,
    "Значение должно быть не меньше {count}.",
  ],
  [
    /^Number must be less than or equal to (\d+)$/,
    "Значение должно быть не больше {count}.",
  ],
  [
    /^String must contain at least (\d+) character\(s\)$/,
    "Введите не менее {count} символов.",
  ],
  [
    /^String must contain at most (\d+) character\(s\)$/,
    "Введите не более {count} символов.",
  ],
];
const patterns = Object.entries(kazakhMessages)
  .filter(([source]) => /\{\d+\}/.test(source))
  .map(([source, target]) => {
    const keys: string[] = [];
    let offset = 0;
    let pattern = "^";
    for (const match of source.matchAll(/\{(\d+)\}/g)) {
      pattern += escapeRegex(source.slice(offset, match.index)) + "(.+?)";
      keys.push(match[1]!);
      offset = match.index! + match[0].length;
    }
    return {
      regex: new RegExp(pattern + escapeRegex(source.slice(offset)) + "$"),
      keys,
      target,
    };
  });

function interpolate(message: string, values: MessageValues) {
  return message.replace(/\{(\w+)\}/g, (token, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : token,
  );
}

/** Translate only known interface messages. User names, messages and form values stay intact. */
export function translateText(
  source: string,
  language: Language,
  values?: MessageValues,
): string {
  const sourceKey = normalize(source);
  if (Object.hasOwn(russianMessages, sourceKey)) {
    return translateText(russianMessages[sourceKey]!, language, values);
  }
  // Validation services return field-prefixed errors and sometimes a JSON array of issues.
  const prefixed = /^([^:]+): (.+)$/s.exec(source);
  if (prefixed && validationFields.has(prefixed[1]!)) {
    return `${translateText(prefixed[1]!, language)}: ${translateText(prefixed[2]!, language)}`;
  }
  for (const [pattern, message] of validationPatterns) {
    const match = pattern.exec(sourceKey);
    if (match) return translateText(message, language, { count: match[1]! });
  }
  if (source.trimStart().startsWith("[")) {
    try {
      const issues: unknown = JSON.parse(source);
      if (
        Array.isArray(issues) &&
        issues.length > 0 &&
        issues.every(
          (issue) =>
            issue &&
            typeof issue.code === "string" &&
            Array.isArray(issue.path) &&
            typeof issue.message === "string",
        )
      )
        return issues
          .map((issue) => translateText(issue.message, language))
          .join("\n");
    } catch {
      /* Ordinary user text is preserved. */
    }
  }
  const key = sourceKey;
  let translated = source;
  if (language === "kk") {
    const exact = Object.hasOwn(kazakhMessages, key)
      ? kazakhMessages[key]
      : undefined;
    if (exact !== undefined) {
      // JSX sometimes separates a sentence with inline markup; preserve its spacing.
      translated =
        source.slice(0, source.length - source.trimStart().length) +
        exact +
        source.slice(source.trimEnd().length);
    } else if (!values) {
      for (const { regex, keys, target } of patterns) {
        const match = regex.exec(key);
        if (match) {
          translated = interpolate(
            target,
            Object.fromEntries(
              keys.map((name, i) => {
                const value = match[i + 1]!;
                return [
                  name,
                  Object.hasOwn(kazakhMessages, value)
                    ? kazakhMessages[value]!
                    : value,
                ];
              }),
            ),
          );
          break;
        }
      }
    }
  }
  return values ? interpolate(translated, values) : translated;
}

export function translator(language: Language) {
  function tr(source: string, values?: MessageValues): string;
  function tr<T>(source: T, values?: MessageValues): T;
  function tr(source: unknown, values?: MessageValues): unknown {
    return typeof source === "string"
      ? translateText(source, language, values)
      : source;
  }
  return tr;
}

const kazakhMonths = [
  "қаңтар",
  "ақпан",
  "наурыз",
  "сәуір",
  "мамыр",
  "маусым",
  "шілде",
  "тамыз",
  "қыркүйек",
  "қазан",
  "қараша",
  "желтоқсан",
];
/** Some Safari builds return M01…M12 for kk-KZ. Supply Kazakh month names explicitly. */
export function formatLocalizedDate(
  value: string | Date,
  language: Language,
  options: Intl.DateTimeFormatOptions = {},
) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const settings = { timeZone: "Asia/Almaty", ...options };
  if (language === "ru")
    return new Intl.DateTimeFormat("ru-RU", settings).format(date);
  const { dateStyle, timeStyle, ...explicit } = settings;
  const fields: Intl.DateTimeFormatOptions = {
    ...(dateStyle
      ? ({
          day: "numeric",
          month: dateStyle === "short" ? "numeric" : "long",
          year: "numeric",
          ...(dateStyle === "full" ? { weekday: "long" } : {}),
        } as Intl.DateTimeFormatOptions)
      : {}),
    ...(timeStyle
      ? ({
          hour: "2-digit",
          minute: "2-digit",
          ...(timeStyle !== "short" ? { second: "2-digit" } : {}),
        } as Intl.DateTimeFormatOptions)
      : {}),
    ...explicit,
  };
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: fields.timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (key: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === key)?.value ?? "";
  const day = Number(part("day"));
  const month = Number(part("month"));
  const hasExplicitDate = Boolean(
    fields.day || fields.month || fields.year || fields.weekday,
  );
  const hasTime = Boolean(fields.hour || fields.minute || fields.second);
  const defaultDate = !hasExplicitDate && !hasTime;
  const longMonth = fields.month === "long" || fields.month === "short";
  const pieces: string[] = [];
  if (fields.day || defaultDate)
    pieces.push(
      fields.day === "numeric" || longMonth
        ? String(day)
        : String(day).padStart(2, "0"),
    );
  if (fields.month || defaultDate)
    pieces.push(
      longMonth ? kazakhMonths[month - 1]! : String(month).padStart(2, "0"),
    );
  if (fields.year || defaultDate)
    pieces.push(
      fields.year === "2-digit" ? part("year").slice(-2) : part("year"),
    );
  let result = pieces.join(longMonth ? " " : ".");
  if (fields.year && longMonth) result += " ж.";
  if (fields.weekday) {
    const weekday = new Date(
      Date.UTC(Number(part("year")), month - 1, day),
    ).getUTCDay();
    const weekdays =
      fields.weekday === "long"
        ? [
            "жексенбі",
            "дүйсенбі",
            "сейсенбі",
            "сәрсенбі",
            "бейсенбі",
            "жұма",
            "сенбі",
          ]
        : ["жс", "дс", "сс", "ср", "бс", "жм", "сб"];
    result = `${weekdays[weekday]}${result ? `, ${result}` : ""}`;
  }
  if (hasTime) {
    const time = [
      fields.hour ? part("hour") : null,
      fields.minute ? part("minute") : null,
      fields.second ? part("second") : null,
    ]
      .filter(Boolean)
      .join(":");
    result += `${result ? ", " : ""}${time}`;
  }
  return result;
}
