import { formatLocalizedDate, type Language } from "@/lib/i18n/core";
import { useI18n } from "@/lib/i18n";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useBlocker } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { saveProfileSection } from "@/lib/profile.functions";
type Entry = {
  save: () => Promise<boolean>;
  discard: () => void;
};
const DirtyContext = createContext<(id: string, entry: Entry | null) => void>(
  () => {},
);
export function UnsavedChanges({ children }: { children: ReactNode }) {
  const { tr } = useI18n();
  const entries = useRef(new Map<string, Entry>());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const register = useCallback((id: string, entry: Entry | null) => {
    if (entry) entries.current.set(id, entry);
    else entries.current.delete(id);
    setDirty(entries.current.size > 0);
  }, []);
  const blocker = useBlocker({
    shouldBlockFn: () => entries.current.size > 0,
    enableBeforeUnload: dirty,
    withResolver: true,
  });
  return (
    <DirtyContext.Provider value={register}>
      {tr(children)}
      <Dialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("Сохранить изменения?")}</DialogTitle>
            <DialogDescription>
              {tr("В этом разделе остались несохранённые данные.")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  for (const entry of entries.current.values())
                    if (!(await entry.save())) return;
                  blocker.proceed?.();
                } finally {
                  setSaving(false);
                }
              }}
            >
              {tr(saving ? "Сохраняем…" : "Сохранить и перейти")}
            </Button>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => {
                for (const entry of entries.current.values()) entry.discard();
                blocker.proceed?.();
              }}
            >
              {tr("Не сохранять")}
            </Button>
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => blocker.reset?.()}
            >
              {tr("Остаться")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DirtyContext.Provider>
  );
}
export function useProfileForm<T extends object>(
  id: string,
  initial: T,
  save: (value: T) => Promise<unknown>,
) {
  const { tr } = useI18n();
  const [value, setValue] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const register = useContext(DirtyContext);
  const qc = useQueryClient();
  const dirty = JSON.stringify(value) !== JSON.stringify(baseline);
  const initialKey = JSON.stringify(initial);
  const syncRef = useRef({ initial, dirty });
  syncRef.current = { initial, dirty };
  useEffect(() => {
    if (!syncRef.current.dirty) {
      setValue(syncRef.current.initial);
      setBaseline(syncRef.current.initial);
    }
  }, [initialKey]); // Preserve edits when background data refreshes.
  async function submit() {
    setBusy(true);
    setError("");
    try {
      await save(value);
      setBaseline(value);
      register(id, null);
      toast.success(tr("Изменения сохранены"));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["profile-workspace"] }),
        qc.invalidateQueries({ queryKey: ["me"] }),
        qc.invalidateQueries({ queryKey: ["event-host"] }),
      ]);
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  function discard() {
    setValue(baseline);
    setError("");
  }
  const current = useRef({ submit, discard });
  current.current = { submit, discard };
  useEffect(() => {
    register(
      id,
      dirty
        ? {
            save: () => current.current.submit(),
            discard: () => current.current.discard(),
          }
        : null,
    );
    return () => register(id, null);
  }, [dirty, id, register]);
  return {
    value,
    setValue,
    busy,
    error,
    dirty,
    submit,
    discard,
    reset: (next: T) => {
      setValue(next);
      setBaseline(next);
      register(id, null);
      setError("");
    },
    patch: (patch: Partial<T>) => setValue((v) => ({ ...v, ...patch })),
  };
}
export function useSectionForm<T extends object>(
  id: string,
  initial: T,
  action: "basic" | "sports" | "privacy" | "notifications" | "host",
) {
  return useProfileForm(id, initial, (value) =>
    saveProfileSection({
      data: { action, payload: value as Record<string, unknown> },
    }),
  );
}
export function SaveRow({
  form,
}: {
  form: {
    busy: boolean;
    dirty: boolean;
    error: string;
    submit: () => Promise<boolean>;
    discard: () => void;
  };
}) {
  const { tr } = useI18n();
  return (
    <>
      <ErrorNotice message={tr(form.error)} />
      <div className="profile-save">
        <span className="workspace-muted text-xs" aria-live="polite">
          {tr(
            form.dirty
              ? "Есть несохранённые изменения"
              : "Все изменения сохранены",
          )}
        </span>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            disabled={!form.dirty || form.busy}
            onClick={form.discard}
          >
            {tr("Отменить")}
          </Button>
          <Button
            disabled={!form.dirty || form.busy}
            onClick={() => void form.submit()}
          >
            {tr(form.busy ? "Сохраняем…" : "Сохранить")}
          </Button>
        </div>
      </div>
    </>
  );
}
export function Panel({
  title,
  subtitle,
  description,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  const { tr } = useI18n();
  return (
    <section className="workspace-panel p-5 sm:p-7">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="workspace-section-title">{tr(title)}</h2>
          {tr(
            (subtitle || description) && (
              <p className="workspace-muted mt-2 text-sm leading-relaxed">
                {tr(subtitle || description)}
              </p>
            ),
          )}
        </div>
        {tr(action)}
      </div>
      {tr(children)}
    </section>
  );
}
export function Empty({
  title,
  text,
  children,
}: {
  title: string;
  text?: string;
  children?: ReactNode;
}) {
  const { tr } = useI18n();
  return (
    <div className="profile-empty">
      <h3>{tr(title)}</h3>
      {tr(
        (children || text) && (
          <div className="workspace-muted mt-2 text-sm">
            {tr(children || text)}
          </div>
        ),
      )}
    </div>
  );
}
export function ErrorNotice({ message }: { message?: string }) {
  const { tr } = useI18n();
  return message ? (
    <p
      role="alert"
      className="my-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
    >
      {tr(message)}
    </p>
  ) : null;
}
export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const { tr } = useI18n();
  return (
    <label className="profile-toggle">
      <span>
        <strong>{tr(label)}</strong>
        {tr(description && <small>{tr(description)}</small>)}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
export function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Не удалось выполнить действие. Попробуйте ещё раз.";
}
export function dateLabel(
  value: string | null,
  withTime = false,
  language: Language = "ru",
) {
  if (!value) return "Не указано";
  return formatLocalizedDate(value, language, {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Asia/Almaty",
  });
}

/** Localize system headings while retaining the organizer's own details and line breaks. */
export function organizerApplicationLabel(
  source: string,
  tr: (message: string) => string,
) {
  return source
    .split(/\n(?=(?:Город|Спорт|Площадки|Опыт|Ссылки|Частота):)/)
    .map((line) => {
      const match =
        /^(Город|Спорт|Площадки|Опыт|Ссылки|Частота):\s*([\s\S]*)$/.exec(line);
      if (!match) return line;
      const [, heading, value] = match;
      const localized =
        heading === "Спорт"
          ? value!
              .split(", ")
              .map((sport) => tr(sport))
              .join(", ")
          : heading === "Город" || heading === "Частота"
            ? tr(value!)
            : value!;
      return `${tr(heading!)}: ${localized}`;
    })
    .join("\n");
}
