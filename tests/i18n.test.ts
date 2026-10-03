import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { kazakhMessages } from "../src/lib/i18n/kk.ts";
import { renderLocalizedMessagePage } from "../src/lib/i18n/message-page.ts";
import {
  translateText,
  translator,
  normalizeLanguage,
  formatLocalizedDate,
} from "../src/lib/i18n/core.ts";

const kk = translator("kk");
const ru = translator("ru");

test("Kazakh is the default, Russian is an explicit persisted choice", () => {
  assert.equal(normalizeLanguage(null), "kk");
  assert.equal(normalizeLanguage("en"), "kk");
  assert.equal(normalizeLanguage("ru"), "ru");
  assert.equal(kk("Мои игры"), "Менің ойындарым");
  assert.equal(ru("Мои игры"), "Мои игры");
  assert.equal(kk("E-mail"), "Электрондық пошта");
  assert.equal(kk("Email"), "Электрондық пошта");
});

test("both languages preserve all interpolation parameters", () => {
  for (const [source, target] of Object.entries(kazakhMessages)) {
    assert.ok(target.trim(), source);
    const parameters = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    assert.deepEqual(parameters(source), parameters(target), source);
  }
  const message = "На Sportura с {year} года";
  assert.equal(kk(message, { year: 2026 }), "Sportura-да 2026 жылдан бері");
  assert.equal(ru(message, { year: 2026 }), "На Sportura с 2026 года");
});

test("dynamic counts and server notifications read naturally in Kazakh", () => {
  for (const source of ["1 место", "2 места", "5 мест", "21 место"]) {
    assert.equal(kk(source), `${source.split(" ")[0]} орын`);
  }
  assert.equal(kk("22 события"), "22 іс-шара");
  assert.equal(kk("осталось 3"), "3 орын қалды");
  assert.equal(kk("Обращение №125"), "№125 өтініш");
  assert.equal(kk("Матч «Арлан»: на проверке"), "Матч «Арлан»: тексерілуде");
  assert.equal(kk("УДАЛИТЬ"), "ЖОЮ");
});

test("user text, values and element identities are not modified", () => {
  for (const source of [
    "Данияр С.",
    "user@example.com",
    "ASTANA-FC-12",
    "constructor",
    "toString",
    "__proto__",
    "Мой собственный текст",
  ]) {
    assert.equal(kk(source), source);
  }
  const values = ["Караганда", "Любая"];
  assert.equal(kk(values), values);
  assert.equal(kk(null), null);
  assert.equal(kk(12), 12);
  assert.equal(kk(" Телефон "), " Телефон ");
  assert.ok(
    translateText("Установи новый пароль для {email}.", "kk", {
      email: "{year}@example.kz",
    }).includes("{year}@example.kz"),
  );
});

test("dates use Kazakhstan time and actual Kazakh month names in every browser", () => {
  const date = "2026-10-02T20:30:00Z";
  assert.equal(
    formatLocalizedDate(date, "kk", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    "3 қазан 2026 ж., 01:30",
  );
  assert.equal(
    formatLocalizedDate(date, "kk", { day: "numeric", month: "long" }),
    "3 қазан",
  );
  assert.match(
    formatLocalizedDate(date, "ru", { day: "numeric", month: "long" }),
    /3 октября/,
  );
  assert.equal(formatLocalizedDate("not-a-date", "kk"), "—");
  assert.equal(formatLocalizedDate(date, "kk", { year: "numeric" }), "2026");
  assert.equal(formatLocalizedDate(date, "kk", { month: "long" }), "қазан");
  assert.equal(
    formatLocalizedDate(date, "kk", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    "01:30:00",
  );
  assert.match(
    formatLocalizedDate(date, "kk", { dateStyle: "long" }),
    /3 қазан 2026/,
  );
});

test("service and field validation errors are localized without leaking raw JSON", () => {
  assert.equal(ru("Invalid login credentials"), "Неверный e-mail или пароль.");
  assert.equal(
    kk("Invalid login credentials"),
    kk("Неверный e-mail или пароль."),
  );
  assert.equal(
    kk("Название: Название — минимум 3 символа"),
    `${kk("Название")}: ${kk("Название — минимум 3 символа")}`,
  );
  assert.equal(
    kk("Максимум участников: Number must be less than or equal to 500"),
    `${kk("Максимум участников")}: ${kk("Значение должно быть не больше {count}.", { count: 500 })}`,
  );
  const issues = JSON.stringify([
    {
      code: "too_small",
      path: ["title"],
      message: "String must contain at least 3 character(s)",
    },
  ]);
  assert.equal(
    kk(issues),
    kk("Введите не менее {count} символов.", { count: 3 }),
  );
});

test("standalone authentication pages localize messages and escape untrusted text", () => {
  const page = renderLocalizedMessagePage(
    "Ссылка недействительна",
    "<img src=x onerror=alert(1)>",
  );
  assert.ok(page.includes('lang="kk"'));
  assert.ok(page.includes("Сілтеме жарамсыз"));
  assert.ok(page.includes("sportura-language"));
  assert.ok(page.includes("&lt;img"));
  assert.ok(!page.includes("<img src=x"));
});

test("all static Russian UI messages have a reviewed Kazakh catalog entry", () => {
  const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile).config;
  const { fileNames } = ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    process.cwd(),
  );
  const missing: string[] = [];
  for (const file of fileNames.filter((name) => name.endsWith(".tsx"))) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    function check(value: string) {
      const key = value.replace(/\s+/g, " ").trim();
      if (/[А-Яа-яЁё]/.test(key) && !Object.hasOwn(kazakhMessages, key))
        missing.push(`${file}: ${key}`);
    }
    function visit(node: ts.Node) {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "tr"
      ) {
        const argument = node.arguments[0];
        if (argument && ts.isStringLiteral(argument)) check(argument.text);
      }
      // New Russian JSX text cannot silently bypass the translation layer.
      if (
        ts.isJsxText(node) &&
        /[А-Яа-яЁё]/.test(node.text) &&
        !file.endsWith("language-toggle.tsx")
      )
        missing.push(`${file}: unlocalized JSX ${node.text.trim()}`);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.deepEqual(missing, []);
});
