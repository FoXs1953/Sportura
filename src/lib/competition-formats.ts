export const COMPETITION_FORMATS = {
  single_elimination: {
    label: "На выбывание",
    description:
      "Одно поражение завершает участие. При нечётном составе один участник проходит без матча.",
  },
  double_elimination: {
    label: "До двух поражений",
    description:
      "После первого поражения участник продолжает в нижней сетке. Финал повторяется, если непобеждённый финалист проиграл впервые.",
  },
  round_robin: {
    label: "Каждый с каждым",
    description:
      "Один круг. При равенстве очков учитываются очки личных встреч, разница и количество забитых мячей.",
  },
  groups_playoff: {
    label: "Группы и плей-офф",
    description:
      "В группах каждый играет с каждым. Два лучших участника каждой группы выходят в плей-офф.",
  },
  swiss: {
    label: "Швейцарская система",
    description:
      "Несколько туров с соперниками близкого результата, без повторных встреч. При равенстве очков: очки соперников, разница, забитые, посев.",
  },
  league_playoff: {
    label: "Лига и финальная четвёрка",
    description:
      "Один или два круга, затем четыре лучших участника разыгрывают плей-офф.",
  },
} as const;
export type CompetitionFormat = keyof typeof COMPETITION_FORMATS;
export const hasStandings = (format?: CompetitionFormat) =>
  !!format &&
  ["round_robin", "groups_playoff", "swiss", "league_playoff"].includes(format);
export const matchStageLabel = (stage?: string, group?: number | null) =>
  ({
    upper: "Верхняя сетка",
    lower: "Нижняя сетка",
    final: "Финал",
    playoff: "Плей-офф",
    swiss: "Швейцарский тур",
    groups: group ? `Группа ${group}` : "Группы",
  })[stage ?? ""] ?? "";
