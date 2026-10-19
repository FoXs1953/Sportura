# Проверка интеграции Искандера — 19 октября 2026

Ветка: `codex/iskander-release-integration`. Исходный SHA `origin/dev`:
`a7d9379`. Цель — `dev`, staging: <https://staging.sportura.kz>.

## Координация и границы

Искандер совмещает ленту и координацию. Отдельного координатора Codex нет.
Auth/email и обслуживание аккаунтов переданы Надиру дополнительно к host.
Его код, скрипт обслуживания, workflow и документация этим пакетом не изменены.

`docs/team-ownership.md` и `scripts/check-task-scope.mjs` содержат одинаковые
границы. Режим `iskander` сохраняет прежнюю область ленты;
`iskander-coordinator` добавляет точный список общих документов,
проверяющего скрипта, его тестов и существующих файлов CI/конфигурации.
Произвольные файлы, область Надира, пакеты, lockfiles, общие компоненты
и миграции режим координатора не разрешает. Для миграций Надира сохранены
прежние имя, владелец и час `2026101911MMSS`; существующие миграции заморожены.

Проверки координационного пакета выполнены Node из
`/Users/ikami/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`:

| Команда | Результат |
| --- | --- |
| `node --test tests/task-scope.test.ts` | 7/7 успешно |
| `node node_modules/eslint/bin/eslint.js scripts/check-task-scope.mjs tests/task-scope.test.ts` | Успешно |
| `node scripts/check-task-scope.mjs iskander-coordinator origin/dev` | Успешно |
| `git diff --check` | Успешно |

Тесты проверяют точные пути auth/account-maintenance, изоляцию владельцев,
границы режима координатора, замороженные файлы, минуты/секунды и имена
миграций, оба пути переименования/копирования, `..`, повторные разделители,
абсолютные пути, обратную косую черту и NUL.

## Блокеры подтверждения staging

При проверке GitHub 19 октября видимые запуски оставались в очереди:

- [39279942191](https://github.com/FoXs1953/Sportura/actions/runs/39279942191)
- [39280072168](https://github.com/FoXs1953/Sportura/actions/runs/39280072168)
- [39280072170](https://github.com/FoXs1953/Sportura/actions/runs/39280072170)
- [39280116767](https://github.com/FoXs1953/Sportura/actions/runs/39280116767)

Последний подтверждённый успешный staging deployment — `f0aa510`
от 12 октября. Очередь GitHub и текущий push не подтверждают развёртывание
изменений от 19 октября. Для приёмки после интеграции требуется успешный
deployment нужного SHA и проверка этого SHA на реальном staging.
