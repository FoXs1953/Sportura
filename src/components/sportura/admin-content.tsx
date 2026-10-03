import { formatDate, useI18n } from "@/lib/i18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  deleteBlock,
  listAdminLog,
  listBlocksAdmin,
  listSettingsAdmin,
  moveBlock,
  saveBlock,
  saveSetting,
  toggleBlock,
} from "@/lib/cms-admin.functions";
import {
  BLOCK_KIND_LABEL,
  DEFAULT_BUSINESS,
  DEFAULT_CATALOG,
  DEFAULT_GENERAL,
  PAGE_LABEL,
  type BlockKind,
  type BusinessSettings,
  type CatalogSettings,
  type GeneralSettings,
} from "@/lib/cms.functions";
const PAGES = ["home", "join", "legal", "profile"] as const;
const KINDS: BlockKind[] = ["hero", "banner", "text", "cards", "faq", "cta"];
type Draft = {
  id: string | null;
  page: string;
  kind: BlockKind;
  title: string;
  subtitle: string;
  body: string;
  image_url: string;
  cta_label: string;
  cta_url: string;
  items: {
    title: string;
    text: string;
  }[];
  position: number;
  published: boolean;
};
const emptyDraft: Draft = {
  id: null,
  page: "home",
  kind: "text",
  title: "",
  subtitle: "",
  body: "",
  image_url: "",
  cta_label: "",
  cta_url: "",
  items: [],
  position: 0,
  published: true,
};
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const { tr } = useI18n();
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] text-muted-foreground">{tr(label)}</span>
      {tr(children)}
    </label>
  );
}
export function ContentTab() {
  const { tr, language } = useI18n();
  const queryClient = useQueryClient();
  const blocks = useQuery({
    queryKey: ["admin", "blocks"],
    queryFn: () => listBlocksAdmin(),
  });
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState(false);
  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["admin", "blocks"] });
    void queryClient.invalidateQueries({ queryKey: ["site"] });
  }
  async function act(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      toast.success(tr(success));
      refresh();
    } catch (err) {
      toast.error(tr(err instanceof Error ? err.message : "Ошибка"));
    }
  }
  async function save() {
    await act(
      () =>
        saveBlock({
          data: {
            ...(draft.id ? { id: draft.id } : {}),
            page: draft.page,
            kind: draft.kind,
            title: draft.title || null,
            subtitle: draft.subtitle || null,
            body: draft.body || null,
            image_url: draft.image_url || null,
            cta_label: draft.cta_label || null,
            cta_url: draft.cta_url || null,
            items: draft.items,
            position: draft.position,
            published: draft.published,
          },
        }),
      draft.id ? "Блок обновлён" : "Блок добавлен",
    );
    setDraft(emptyDraft);
    setEditing(false);
  }
  const list = (blocks.data ?? []) as any[];
  const withItems = draft.kind === "cards" || draft.kind === "faq";
  return (
    <div className="space-y-4">
      {!editing ? (
        <Button
          className="press w-full"
          onClick={() => {
            setDraft({ ...emptyDraft, position: list.length });
            setEditing(true);
          }}
        >
          {tr("Добавить блок на страницу")}
        </Button>
      ) : (
        <div className="panel-frost space-y-3 rounded-2xl p-5">
          <p className="text-sm font-semibold">
            {tr(draft.id ? "Изменить блок" : "Новый блок")}
          </p>

          <Field label={tr("Страница")}>
            <div className="flex flex-wrap gap-2">
              {PAGES.map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={draft.page === p ? "default" : "secondary"}
                  className="press"
                  onClick={() => setDraft({ ...draft, page: p })}
                >
                  {tr(PAGE_LABEL[p] ?? p)}
                </Button>
              ))}
            </div>
          </Field>

          <Field label={tr("Вид блока")}>
            <div className="flex flex-wrap gap-2">
              {KINDS.map((k) => (
                <Button
                  key={k}
                  size="sm"
                  variant={draft.kind === k ? "default" : "secondary"}
                  className="press"
                  onClick={() => setDraft({ ...draft, kind: k })}
                >
                  {tr(BLOCK_KIND_LABEL[k])}
                </Button>
              ))}
            </div>
          </Field>

          <Field label={tr("Заголовок")}>
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </Field>
          <Field label={tr("Подзаголовок")}>
            <Input
              value={draft.subtitle}
              onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
            />
          </Field>
          <Field label={tr("Текст")}>
            <Textarea
              rows={4}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
          </Field>
          {draft.kind === "hero" ? (
            <Field label={tr("Ссылка на картинку (https://…)")}>
              <Input
                value={draft.image_url}
                onChange={(e) =>
                  setDraft({ ...draft, image_url: e.target.value })
                }
              />
            </Field>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Field label={tr("Надпись на кнопке")}>
              <Input
                value={draft.cta_label}
                onChange={(e) =>
                  setDraft({ ...draft, cta_label: e.target.value })
                }
              />
            </Field>
            <Field label={tr("Куда ведёт кнопка")}>
              <Input
                value={draft.cta_url}
                onChange={(e) =>
                  setDraft({ ...draft, cta_url: e.target.value })
                }
                placeholder={tr("/join или https://…")}
              />
            </Field>
          </div>

          {withItems ? (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">
                {tr("Пункты списка")}
              </p>
              {draft.items.map((item, i) => (
                <div
                  key={i}
                  className="panel-frost-2 space-y-2 rounded-2xl p-3"
                >
                  <Input
                    placeholder={tr("Заголовок пункта")}
                    value={item.title}
                    onChange={(e) => {
                      const items = [...draft.items];
                      items[i] = { ...item, title: e.target.value };
                      setDraft({ ...draft, items });
                    }}
                  />
                  <Textarea
                    rows={2}
                    placeholder={tr("Текст пункта")}
                    value={item.text}
                    onChange={(e) => {
                      const items = [...draft.items];
                      items[i] = { ...item, text: e.target.value };
                      setDraft({ ...draft, items });
                    }}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="press"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        items: draft.items.filter((_, idx) => idx !== i),
                      })
                    }
                  >
                    {tr("Удалить пункт")}
                  </Button>
                </div>
              ))}
              <Button
                size="sm"
                variant="secondary"
                className="press"
                onClick={() =>
                  setDraft({
                    ...draft,
                    items: [...draft.items, { title: "", text: "" }],
                  })
                }
              >
                {tr("Добавить пункт")}
              </Button>
            </div>
          ) : null}

          <div className="flex items-center justify-between">
            <Label className="text-xs">{tr("Показывать на сайте")}</Label>
            <Switch
              checked={draft.published}
              onCheckedChange={(v) => setDraft({ ...draft, published: v })}
            />
          </div>

          <div className="flex gap-2">
            <Button className="press" onClick={() => void save()}>
              {tr("Сохранить")}
            </Button>
            <Button
              variant="secondary"
              className="press"
              onClick={() => {
                setDraft(emptyDraft);
                setEditing(false);
              }}
            >
              {tr("Отмена")}
            </Button>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <p className="panel-frost rounded-2xl p-5 text-sm text-muted-foreground">
          {tr(
            "Блоков пока нет. Добавьте первый — он сразу появится на выбранной странице.",
          )}
        </p>
      ) : (
        list.map((b) => (
          <div key={b.id} className="panel-frost space-y-2 rounded-2xl p-4">
            <p className="text-sm font-semibold">
              {tr(b.title || BLOCK_KIND_LABEL[b.kind as BlockKind])}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {tr(PAGE_LABEL[b.page] ?? b.page)} ·{tr(" ")}
              {tr(BLOCK_KIND_LABEL[b.kind as BlockKind])}
              {tr(" · порядок ")}
              {tr(b.position)} ·{tr(" ")}
              {tr(b.published ? "показан" : "скрыт")}
            </p>
            {b.body ? (
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {tr(b.body)}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="press"
                onClick={() => {
                  setDraft({
                    id: b.id,
                    page: b.page,
                    kind: b.kind,
                    title: b.title ?? "",
                    subtitle: b.subtitle ?? "",
                    body: b.body ?? "",
                    image_url: b.image_url ?? "",
                    cta_label: b.cta_label ?? "",
                    cta_url: b.cta_url ?? "",
                    items: Array.isArray(b.items)
                      ? b.items.map((i: any) => ({
                          title: i.title ?? "",
                          text: i.text ?? "",
                        }))
                      : [],
                    position: b.position,
                    published: b.published,
                  });
                  setEditing(true);
                }}
              >
                {tr("Изменить")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="press"
                onClick={() =>
                  void act(
                    () =>
                      toggleBlock({
                        data: { id: b.id, published: !b.published },
                      }),
                    b.published ? "Блок скрыт" : "Блок показан",
                  )
                }
              >
                {tr(b.published ? "Скрыть" : "Показать")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="press"
                onClick={() =>
                  void act(
                    () => moveBlock({ data: { id: b.id, direction: "up" } }),
                    "Выше",
                  )
                }
              >
                {tr("Выше")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="press"
                onClick={() =>
                  void act(
                    () => moveBlock({ data: { id: b.id, direction: "down" } }),
                    "Ниже",
                  )
                }
              >
                {tr("Ниже")}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="press"
                onClick={() =>
                  void act(
                    () => deleteBlock({ data: { id: b.id } }),
                    "Блок удалён",
                  )
                }
              >
                {tr("Удалить")}
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
export function SettingsTab() {
  const { tr, language } = useI18n();
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => listSettingsAdmin(),
  });
  const rows = (settings.data ?? []) as {
    key: string;
    value: any;
  }[];
  const stored = (key: string) => rows.find((r) => r.key === key)?.value ?? {};
  const [general, setGeneral] = useState<GeneralSettings | null>(null);
  const [catalog, setCatalog] = useState<CatalogSettings | null>(null);
  const [business, setBusiness] = useState<BusinessSettings | null>(null);
  const g = general ?? { ...DEFAULT_GENERAL, ...stored("general") };
  const c = catalog ?? { ...DEFAULT_CATALOG, ...stored("catalog") };
  const b = business ?? { ...DEFAULT_BUSINESS, ...stored("business") };
  async function save(
    key: "general" | "catalog" | "business",
    value: Record<string, unknown>,
  ) {
    try {
      await saveSetting({ data: { key, value } });
      toast.success(tr("Сохранено"));
      void queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
      void queryClient.invalidateQueries({ queryKey: ["site"] });
    } catch (err) {
      toast.error(tr(err instanceof Error ? err.message : "Ошибка"));
    }
  }
  return (
    <div className="space-y-4">
      <div className="panel-frost space-y-3 rounded-2xl p-5">
        <p className="text-sm font-semibold">{tr("Общее")}</p>
        <Field label={tr("Название сайта")}>
          <Input
            value={g.site_name}
            onChange={(e) => setGeneral({ ...g, site_name: e.target.value })}
          />
        </Field>
        <Field label={tr("Подпись под названием")}>
          <Input
            value={g.tagline}
            onChange={(e) => setGeneral({ ...g, tagline: e.target.value })}
          />
        </Field>
        <Field label={tr("Город по умолчанию")}>
          <Input
            value={g.default_city}
            onChange={(e) => setGeneral({ ...g, default_city: e.target.value })}
          />
        </Field>
        <Field label={tr("Объявление для всех посетителей")}>
          <Textarea
            rows={2}
            value={g.announcement}
            onChange={(e) => setGeneral({ ...g, announcement: e.target.value })}
          />
        </Field>
        <div className="flex items-center justify-between">
          <Label className="text-xs">{tr("Показывать объявление")}</Label>
          <Switch
            checked={g.announcement_enabled}
            onCheckedChange={(v) =>
              setGeneral({ ...g, announcement_enabled: v })
            }
          />
        </div>
        <Field label={tr("Текст режима обслуживания")}>
          <Textarea
            rows={2}
            value={g.maintenance_message}
            onChange={(e) =>
              setGeneral({ ...g, maintenance_message: e.target.value })
            }
          />
        </Field>
        <div className="flex items-center justify-between">
          <Label className="text-xs">{tr("Режим обслуживания")}</Label>
          <Switch
            checked={g.maintenance_mode}
            onCheckedChange={(v) => setGeneral({ ...g, maintenance_mode: v })}
          />
        </div>
        <Field label={tr("Контакт поддержки")}>
          <Input
            value={g.support_contact}
            onChange={(e) =>
              setGeneral({ ...g, support_contact: e.target.value })
            }
          />
        </Field>
        <Button
          className="press"
          onClick={() => void save("general", { ...g })}
        >
          {tr("Сохранить общее")}
        </Button>
      </div>

      <div className="panel-frost space-y-3 rounded-2xl p-5">
        <p className="text-sm font-semibold">{tr("Виды спорта и города")}</p>
        <Field label={tr("Виды спорта (через запятую)")}>
          <Textarea
            rows={2}
            value={c.sports.join(", ")}
            onChange={(e) =>
              setCatalog({
                ...c,
                sports: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
        <Field label={tr("Города (через запятую)")}>
          <Textarea
            rows={2}
            value={c.cities.join(", ")}
            onChange={(e) =>
              setCatalog({
                ...c,
                cities: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
        <Button
          className="press"
          onClick={() => void save("catalog", { ...c })}
        >
          {tr("Сохранить список")}
        </Button>
      </div>

      <div className="panel-frost space-y-3 rounded-2xl p-5">
        <p className="text-sm font-semibold">{tr("Правила платформы")}</p>
        <div className="grid grid-cols-2 gap-2"></div>
        <Field label={tr("Окно споров, часов")}>
          <Input
            type="number"
            value={b.dispute_window_hours}
            onChange={(e) =>
              setBusiness({
                ...b,
                dispute_window_hours: Number(e.target.value),
              })
            }
          />
        </Field>
        <div className="flex items-center justify-between">
          <Label className="text-xs">{tr("Запись на события включена")}</Label>
          <Switch
            checked={b.registrations_enabled}
            onCheckedChange={(v) =>
              setBusiness({ ...b, registrations_enabled: v })
            }
          />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">{tr("Создание событий включено")}</Label>
          <Switch
            checked={b.activity_creation_enabled}
            onCheckedChange={(v) =>
              setBusiness({ ...b, activity_creation_enabled: v })
            }
          />
        </div>
        <Button
          className="press"
          onClick={() => void save("business", { ...b })}
        >
          {tr("Сохранить правила")}
        </Button>
      </div>
    </div>
  );
}
export function AuditTab() {
  const { tr, language } = useI18n();
  const log = useQuery({
    queryKey: ["admin", "auditlog"],
    queryFn: () => listAdminLog(),
  });
  const rows = (log.data ?? []) as any[];
  const actionLabels: Record<string, string> = {
    insert: "Запись создана",
    update: "Запись обновлена",
    delete: "Запись удалена",
  };
  const entityLabels: Record<string, string> = {
    registrations: "Записи участников",
    disputes: "Споры",
    manager_applications: "Заявки организаторов",
  };
  if (rows.length === 0) {
    return (
      <p className="panel-frost rounded-2xl p-5 text-sm text-muted-foreground">
        {tr("Действий администраторов пока не было.")}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="panel-frost rounded-2xl p-4 text-xs">
          <p className="font-semibold">
            {tr(actionLabels[r.action] ?? r.action)}
          </p>
          <p className="text-muted-foreground">
            {tr(r.actor?.name ?? "—")} ·{" "}
            {tr(entityLabels[r.entity] ?? r.entity)}
            {tr(r.entity_id ? ` · ${String(r.entity_id).slice(0, 8)}` : "")} ·
            {tr(" ")}
            {tr(
              formatDate(
                r.created_at,
                {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                },
                language,
              ),
            )}
          </p>
        </div>
      ))}
    </div>
  );
}
