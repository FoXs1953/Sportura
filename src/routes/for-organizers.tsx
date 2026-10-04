import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarDays,
  Check,
  MapPin,
  ShieldCheck,
  Trophy,
  UsersRound,
} from "lucide-react";
import { AppShell } from "@/components/sportura/shell";
import { useI18n } from "@/lib/i18n";
import "@/styles/guest-info.css";

export const Route = createFileRoute("/for-organizers")({
  head: () => ({
    meta: [
      { title: "Организаторам — Sportura" },
      {
        name: "description",
        content:
          "Создавайте бесплатные спортивные игры, турниры и лиги в Sportura. Узнайте о возможностях кабинета и подайте заявку на роль организатора.",
      },
    ],
  }),
  component: ForOrganizersPage,
});

const roles = [
  {
    icon: UsersRound,
    title: "Спорт-менеджер",
    body: "Проводит игры, управляет составом и отмечает посещаемость.",
    features: [
      "Создание и публикация спортивных игр",
      "Записи участников и лист ожидания",
      "Чек-ин и учёт посещаемости",
    ],
  },
  {
    icon: Trophy,
    title: "Организатор турниров",
    body: "Создаёт турниры и лиги, публикует результаты и управляет соревнованиями.",
    features: [
      "Регистрация участников и команд",
      "Турнирная сетка и расписание матчей",
      "Публикация результатов соревнования",
    ],
  },
];

const applicationSteps = [
  {
    title: "Подготовьте профиль",
    body: "Укажите имя и телефон, подтвердите контакт. Для подачи заявки аккаунт должен быть активен.",
  },
  {
    title: "Подайте заявку",
    body: "В разделе «Роль организатора» выберите роль и расскажите о спорте, городе, площадках и опыте проведения событий.",
  },
  {
    title: "Создайте первое событие",
    body: "После одобрения роли откроется кабинет. Укажите место, время, число мест, уровень, правила и что взять с собой, затем опубликуйте событие.",
  },
];

function ForOrganizersPage() {
  const { tr } = useI18n();
  return (
    <AppShell
      title={tr("Собирайте людей на спорт")}
      subtitle={tr("Игры, участники и результаты — в одном кабинете Sportura")}
      action={
        <Link
          to="/profile"
          search={{ tab: "organizer" }}
          className="feed-primary"
        >
          {tr("Стать организатором")}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      }
    >
      <p className="guest-notice">
        <ShieldCheck size={20} aria-hidden="true" />
        {tr(
          "В текущей версии можно публиковать только бесплатные события. Приём платежей на платформе пока недоступен.",
        )}
      </p>
      <section
        className="guest-section"
        aria-labelledby="organizer-roles-title"
      >
        <div className="guest-section-heading">
          <h2 id="organizer-roles-title">{tr("Выберите свою роль")}</h2>
        </div>
        <div className="guest-role-grid">
          {roles.map(({ icon: Icon, title, body, features }) => (
            <article className="guest-card guest-role" key={title}>
              <span className="guest-icon" aria-hidden="true">
                <Icon size={22} />
              </span>
              <h3>{tr(title)}</h3>
              <p>{tr(body)}</p>
              <ul className="guest-features">
                {features.map((feature) => (
                  <li key={feature}>
                    <Check size={17} aria-hidden="true" />
                    {tr(feature)}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
      <section
        className="guest-section"
        aria-labelledby="organizer-start-title"
      >
        <div className="guest-section-heading">
          <h2 id="organizer-start-title">{tr("Как начать")}</h2>
        </div>
        <ol className="guest-steps">
          {applicationSteps.map(({ title, body }, index) => (
            <li className="guest-card" key={title}>
              <span className="guest-step-number" aria-hidden="true">
                0{index + 1}
              </span>
              <h3>{tr(title)}</h3>
              <p>{tr(body)}</p>
            </li>
          ))}
        </ol>
      </section>
      <section
        className="guest-example-grid guest-section"
        aria-labelledby="example-title"
      >
        <div className="guest-example-copy">
          <h2 id="example-title">{tr("Понятная карточка для участников")}</h2>
          <p>
            {tr(
              "Участник видит формат, уровень, время, адрес и правила до записи. Ваши опубликованные события появляются в ленте, а состав и изменения доступны в кабинете.",
            )}
          </p>
          <Link to="/help" className="guest-text-link">
            {tr("Как проходит участие")}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <article className="guest-card guest-example">
          <span className="guest-example-label">{tr("Пример карточки")}</span>
          <h3>{tr("Волейбол для начинающих")}</h3>
          <div className="guest-example-tags">
            <span>{tr("Бесплатно")}</span>
            <span>{tr("Индивидуальная запись")}</span>
          </div>
          <ul className="guest-example-details">
            <li>
              <CalendarDays size={17} aria-hidden="true" />
              {tr("Дата и время вашей игры")}
            </li>
            <li>
              <MapPin size={17} aria-hidden="true" />
              {tr("Город и точный адрес площадки")}
            </li>
            <li>
              <UsersRound size={17} aria-hidden="true" />
              {tr("Уровень и число мест")}
            </li>
          </ul>
          <p className="guest-example-disclaimer">
            {tr(
              "Иллюстрация. Это не опубликованное событие, запись недоступна.",
            )}
          </p>
        </article>
      </section>
      <section
        className="guest-support guest-card"
        aria-labelledby="apply-title"
      >
        <div>
          <h2 id="apply-title">{tr("Готовы провести первую игру?")}</h2>
          <p>
            {tr(
              "Войдите или создайте аккаунт. После входа откроется заявка на роль организатора в профиле.",
            )}
          </p>
        </div>
        <Link
          to="/profile"
          search={{ tab: "organizer" }}
          className="feed-primary"
        >
          {tr("Подать заявку")}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>
    </AppShell>
  );
}
