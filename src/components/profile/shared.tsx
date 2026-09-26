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

type Entry = { save: () => Promise<boolean>; discard: () => void };
const DirtyContext = createContext<(id: string, entry: Entry | null) => void>(
  () => {},
);
export function UnsavedChanges({ children }: { children: ReactNode }) {
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
      {children}
      <Dialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Сохранить изменения?</DialogTitle>
            <DialogDescription>
              В этом разделе остались несохранённые данные.
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
              {saving ? "Сохраняем…" : "Сохранить и перейти"}
            </Button>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => {
                for (const entry of entries.current.values()) entry.discard();
                blocker.proceed?.();
              }}
            >
              Не сохранять
            </Button>
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => blocker.reset?.()}
            >
              Остаться
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
      toast.success("Изменения сохранены");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["profile-workspace"] }),
        qc.invalidateQueries({ queryKey: ["me"] }),
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
  return (
    <>
      <ErrorNotice message={form.error} />
      <div className="profile-save">
        <span className="workspace-muted text-xs" aria-live="polite">
          {form.dirty
            ? "Есть несохранённые изменения"
            : "Все изменения сохранены"}
        </span>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            disabled={!form.dirty || form.busy}
            onClick={form.discard}
          >
            Отменить
          </Button>
          <Button
            disabled={!form.dirty || form.busy}
            onClick={() => void form.submit()}
          >
            {form.busy ? "Сохраняем…" : "Сохранить"}
          </Button>
        </div>
      </div>
    </>
  );
}
export function Panel({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="workspace-panel p-5 sm:p-7">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="workspace-section-title">{title}</h2>
          {subtitle && (
            <p className="workspace-muted mt-2 text-sm leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="profile-empty">
      <h3>{title}</h3>
      {children && (
        <div className="workspace-muted mt-2 text-sm">{children}</div>
      )}
    </div>
  );
}
export function ErrorNotice({ message }: { message?: string }) {
  return message ? (
    <p
      role="alert"
      className="my-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
    >
      {message}
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
  return (
    <label className="profile-toggle">
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
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
export function dateLabel(value: string | null, withTime = false) {
  if (!value) return "Не указано";
  return new Date(value).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Asia/Almaty",
  });
}
