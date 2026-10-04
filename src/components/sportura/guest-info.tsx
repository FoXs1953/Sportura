import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarCheck, Search, UsersRound } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import "@/styles/guest-info.css";

const steps = [
  {
    icon: Search,
    title: "Найдите игру",
    body: "Выберите город, спорт и подходящий уровень. Проверьте время и площадку в карточке события.",
  },
  {
    icon: CalendarCheck,
    title: "Запишитесь",
    body: "Войдите или создайте аккаунт и подтвердите запись. Событие появится в «Моих играх».",
  },
  {
    icon: UsersRound,
    title: "Приходите играть",
    body: "Прочитайте, что взять с собой, и подтвердите присутствие в карточке события перед началом.",
  },
];

export function HowItWorks() {
  const { tr } = useI18n();
  return (
    <section className="guest-section" aria-labelledby="how-it-works-title">
      <div className="guest-section-heading">
        <h2 id="how-it-works-title">{tr("Как это работает")}</h2>
        <Link to="/help" className="guest-text-link">
          {tr("Вопросы и ответы")}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <ol className="guest-steps">
        {steps.map(({ icon: Icon, title, body }, index) => (
          <li key={title} className="guest-card">
            <div className="guest-step-top">
              <Icon size={20} aria-hidden="true" />
              <span aria-hidden="true">0{index + 1}</span>
            </div>
            <h3>{tr(title)}</h3>
            <p>{tr(body)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
