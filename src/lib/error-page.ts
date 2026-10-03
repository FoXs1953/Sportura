export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="kk">
  <head>
    <meta charset="utf-8" />
    <title>Бет жүктелмеді — Sportura</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; box-sizing: border-box; }
      .card { max-width: 28rem; width: 100%; text-align: center; }
      h1 { font-size: 1.25rem; margin: 1rem 0 0.5rem; }
      p { color: #4b5563; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.6rem 1rem; border-radius: 0.5rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid #d1d5db; background: #fff; color: #111; }
      .primary, [aria-pressed="true"] { background: #111; color: #fff; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="actions" role="group" aria-label="Тіл / Язык">
        <button id="kk" lang="kk" aria-pressed="true" onclick="setLanguage('kk')">ҚАЗ</button>
        <button id="ru" lang="ru" aria-pressed="false" onclick="setLanguage('ru')">РУС</button>
      </div>
      <h1 id="title">Бет жүктелмеді</h1>
      <p id="message">Бетті ашу кезінде қате пайда болды. Қайталап көріңіз немесе басты бетке оралыңыз.</p>
      <div class="actions">
        <button id="retry" class="primary" onclick="location.reload()">Қайталау</button>
        <a id="home" href="/">Басты бетке</a>
      </div>
    </div>
    <script>
      const messages = {
        kk: ['Бет жүктелмеді', 'Бетті ашу кезінде қате пайда болды. Қайталап көріңіз немесе басты бетке оралыңыз.', 'Қайталау', 'Басты бетке'],
        ru: ['Страница не загрузилась', 'Не удалось открыть страницу. Попробуйте ещё раз или вернитесь на главную.', 'Повторить', 'На главную']
      };
      function setLanguage(value) {
        const language = value === 'ru' ? 'ru' : 'kk';
        document.documentElement.lang = language;
        ['title', 'message', 'retry', 'home'].forEach((id, i) => document.getElementById(id).textContent = messages[language][i]);
        document.title = messages[language][0] + ' — Sportura';
        ['kk', 'ru'].forEach(id => document.getElementById(id).setAttribute('aria-pressed', String(id === language)));
        try { localStorage.setItem('sportura-language', language); } catch {}
      }
      try { setLanguage(localStorage.getItem('sportura-language')); } catch {}
    </script>
  </body>
</html>`;
}
