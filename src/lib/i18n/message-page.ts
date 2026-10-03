import { languageStorageKey, translator } from "./core.ts";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );

/** Standalone authentication pages cannot rely on React or the application bundle. */
export function renderLocalizedMessagePage(
  title: string,
  message: string,
  link = "/",
  linkLabel = "На главную",
) {
  const messages = Object.fromEntries(
    ["kk", "ru"].map((language) => {
      const tr = translator(language as "kk" | "ru");
      return [language, [tr(title), tr(message), tr(linkLabel)]];
    }),
  );
  const initial = messages["kk"]!;
  const serialized = JSON.stringify(messages).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="kk"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(initial[0]!)} — Sportura</title><link rel="icon" href="/icons/sportura-favicon-32.png" type="image/png">
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;background:#fff;color:#172033}html.dark body{background:#111617;color:#f2f5f7}a{color:#5578d5}button{padding:.6rem 1rem;border:1px solid #8290a4;border-radius:.5rem;background:transparent;color:inherit;cursor:pointer}button[aria-pressed=true]{background:#5578d5;color:white}</style>
</head><body><div role="group" aria-label="Тіл / Язык"><button lang="kk" id="kk" aria-pressed="true" onclick="setLanguage('kk')">ҚАЗ</button> <button lang="ru" id="ru" aria-pressed="false" onclick="setLanguage('ru')">РУС</button></div>
<h1 id="title">${escapeHtml(initial[0]!)}</h1><p id="message">${escapeHtml(initial[1]!)}</p><p><a id="link" href="${escapeHtml(link)}">${escapeHtml(initial[2]!)}</a></p>
<script>const messages=${serialized};function setLanguage(value){const language=value==='ru'?'ru':'kk';document.documentElement.lang=language;['title','message','link'].forEach((id,i)=>document.getElementById(id).textContent=messages[language][i]);document.title=messages[language][0]+' — Sportura';['kk','ru'].forEach(id=>document.getElementById(id).setAttribute('aria-pressed',String(id===language)));try{localStorage.setItem('${languageStorageKey}',language)}catch{}}try{document.documentElement.classList.toggle('dark',localStorage.getItem('sportura-theme')==='dark');setLanguage(localStorage.getItem('${languageStorageKey}'))}catch{}</script>
</body></html>`;
}
