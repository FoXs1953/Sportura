type PublicEvent = {
  type: string;
  status: string;
  is_private: boolean;
  registered_count: number;
};

/** Only published public events contribute to a public organizer page. */
export function publicOrganizerActivitySummary<T extends PublicEvent>(
  events: T[],
  showStats: boolean,
) {
  const published = events.filter(
    (event) => !event.is_private && event.status !== "draft",
  );
  const visibleStats = showStats ? published : [];
  return {
    stats: {
      games: visibleStats.filter((event) => event.type === "daily_game").length,
      competitions: visibleStats.filter((event) => event.type !== "daily_game")
        .length,
      completed: visibleStats.filter((event) => event.status === "completed")
        .length,
      cancelled: visibleStats.filter((event) => event.status === "cancelled")
        .length,
      players: visibleStats.reduce(
        (sum, event) => sum + (event.registered_count ?? 0),
        0,
      ),
    },
    upcoming: published
      .filter((event) => !["completed", "cancelled"].includes(event.status))
      .slice(0, 10),
  };
}
