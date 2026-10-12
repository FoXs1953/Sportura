const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function registrationDeadlineLimit(start: string | null | undefined) {
  const time = start ? Date.parse(start) : NaN;
  return Number.isFinite(time)
    ? new Date(time + THIRTY_DAYS_MS).toISOString()
    : null;
}

export function registrationDeadlineAllowed(
  start: string | null | undefined,
  deadline: string | null | undefined,
) {
  if (!deadline) return true;
  const limit = registrationDeadlineLimit(start);
  return !!limit && Date.parse(deadline) <= Date.parse(limit);
}

export function registrationTimeOpen(
  activity: {
    date_time: string | null;
    registration_deadline: string | null;
  },
  now = Date.now(),
) {
  const cutoff = activity.registration_deadline || activity.date_time;
  return !cutoff || Date.parse(cutoff) > now;
}
