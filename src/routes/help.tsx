import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, LifeBuoy } from "lucide-react";
import { AppShell } from "@/components/sportura/shell";
import { HowItWorks } from "@/components/sportura/guest-info";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Помощь — Sportura" },
      {
        name: "description",
        content:
          "Как найти игру, записаться, отменить участие, пройти чек-ин и обратиться в поддержку Sportura.",
      },
    ],
  }),
  component: HelpPage,
});

const questions = [
  {
    question: "Можно прийти одному?",
    answer:
      "Да, выбирайте событие с индивидуальной записью. Если в карточке указана запись командой, понадобятся название и состав команды. Формат участия указан в карточке до записи.",
  },
  {
    question: "Подойдут ли игры новичку?",
    answer:
      "В фильтрах выберите «Начальный» или «Без ограничений» и прочитайте описание и правила события. Требования к участникам определяет организатор.",
  },
  {
    question: "Что взять с собой?",
    answer:
      "Посмотрите раздел «Что взять и как подготовиться» в карточке события: там организатор указывает форму, обувь и инвентарь. Если информации недостаточно, уточните требования у организатора до поездки.",
  },
  {
    question: "Нужен ли аккаунт и сколько стоит участие?",
    answer:
      "Смотреть события можно без аккаунта. Для записи, сохранения игр и обращений в поддержку нужно войти или зарегистрироваться. Сейчас на Sportura доступны только бесплатные события.",
  },
  {
    question: "Как отменить запись?",
    answer:
      "До начала события откройте свою запись в «Моих играх» и отмените участие. После формирования турнирной сетки изменение состава рассматривается через поддержку. Перед поездкой проверяйте статус события: организатор может его отменить.",
  },
  {
    question: "Что делать, если мест нет?",
    answer:
      "Встаньте в лист ожидания в карточке события. Когда освободится место, вы получите уведомление в приложении и сможете подтвердить запись. На подтверждение — до 15 минут, но не позже закрытия регистрации или начала события. Лист ожидания не гарантирует участие.",
  },
  {
    question: "Как подтвердить присутствие?",
    answer:
      "Нажмите «Подтвердить присутствие» в карточке своей игры. Чек-ин доступен за 60 минут до начала и в первые 30 минут события. Если организатор ошибочно отметил ваше отсутствие, обратитесь в поддержку из своей записи.",
  },
  {
    question: "Где посмотреть результаты и сообщить о проблеме?",
    answer:
      "Результаты соревнований публикуются в карточке события. Срок подачи спора указан рядом с итогами. По вопросам записи, посещаемости или работы сайта создайте обращение в разделе помощи в профиле; там же появится ответ поддержки.",
  },
];

function HelpPage() {
  const { tr } = useI18n();
  return (
    <AppShell
      title={tr("Помощь")}
      subtitle={tr("Всё, что нужно знать перед первой игрой")}
      action={
        <Link to="/" className="feed-chip guest-secondary-link">
          {tr("Найти игру")}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      }
    >
      <HowItWorks />
      <section className="guest-section guest-faq" aria-labelledby="faq-title">
        <div className="guest-section-heading">
          <h2 id="faq-title">{tr("Вопросы и ответы")}</h2>
        </div>
        <Accordion type="single" collapsible>
          {questions.map(({ question, answer }, index) => (
            <AccordionItem value={`question-${index}`} key={question}>
              <AccordionTrigger>{tr(question)}</AccordionTrigger>
              <AccordionContent className="guest-faq-answer">
                {tr(answer)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
      <section
        className="guest-support guest-card"
        aria-labelledby="support-title"
      >
        <div className="guest-support-copy">
          <span className="guest-icon" aria-hidden="true">
            <LifeBuoy size={22} />
          </span>
          <div>
            <h2 id="support-title">{tr("Нужна помощь?")}</h2>
            <p>
              {tr(
                "Опишите вопрос в профиле. Для обращения войдите или создайте аккаунт — после входа откроется раздел поддержки.",
              )}
            </p>
          </div>
        </div>
        <Link to="/profile" search={{ tab: "help" }} className="feed-primary">
          {tr("Написать в поддержку")}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>
      <p className="guest-footnote">
        <Link to="/legal" className="guest-text-link">
          {tr("Правила и документы")}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </p>
    </AppShell>
  );
}
