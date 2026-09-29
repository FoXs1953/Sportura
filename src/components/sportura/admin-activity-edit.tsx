import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { updateActivityAdmin } from "@/lib/cms-admin.functions";

type ActivityRow = Record<string, any>;

const STATUSES: [string, string][] = [
  ["open", "Открыта"],
  ["nearly_full", "Почти заполнена"],
  ["full", "Мест нет"],
  ["completed", "Завершена"],
  ["cancelled", "Отменена"],
];

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function toLocalInput(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ActivityEditor({
  activity,
  canEditCommission = true,
  onClose,
  onSaved,
}: {
  activity: ActivityRow;
  canEditCommission?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    title: activity["title"] ?? "",
    sport: activity["sport"] ?? "",
    city: activity["city"] ?? "Астана",
    host_name: activity["host_name"] ?? "",
    location_text: activity["location_text"] ?? "",
    two_gis_url: activity["two_gis_url"] ?? "",
    kaspi_payment_link: activity["kaspi_payment_link"] ?? "",
    time_text: activity["time_text"] ?? "",
    date_time: toLocalInput(activity["date_time"]),
    registration_deadline: toLocalInput(activity["registration_deadline"]),
    price_text: activity["price_text"] ?? "",
    entry_fee:
      activity["entry_fee"] === null || activity["entry_fee"] === undefined
        ? ""
        : String(activity["entry_fee"]),
    max_participants: String(activity["max_participants"] ?? 10),
    status: String(activity["status"] ?? "open"),
    is_private: Boolean(activity["is_private"]),
    description: activity["description"] ?? "",
    skill_level: activity["skill_level"] ?? "",
    age_division: activity["age_division"] ?? "",
    format: activity["format"] ?? "",
    recurrence: activity["recurrence"] ?? "",
    cancellation_policy: activity["cancellation_policy"] ?? "",
    notes: activity["notes"] ?? "",
    commission_percent: String(activity["commission_percent"] ?? 10),
  });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      await updateActivityAdmin({
        data: {
          activityId: activity["id"],
          title: form.title.trim(),
          sport: form.sport.trim(),
          city: form.city.trim(),
          host_name: form.host_name.trim(),
          location_text: form.location_text.trim(),
          two_gis_url: form.two_gis_url,
          kaspi_payment_link: form.kaspi_payment_link,
          time_text: form.time_text,
          date_time: form.date_time,
          registration_deadline: form.registration_deadline,
          price_text: form.price_text,
          entry_fee:
            form.entry_fee.trim() === "" ? null : Number(form.entry_fee),
          max_participants: Number(form.max_participants),
          status: form.status as "open",
          is_private: form.is_private,
          description: form.description,
          skill_level: form.skill_level,
          age_division: form.age_division,
          format: form.format,
          recurrence: form.recurrence,
          cancellation_policy: form.cancellation_policy,
          notes: form.notes,
          commission_percent: Number(form.commission_percent),
        },
      });
      toast.success("Карточка обновлена");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel-frost-2 mt-3 space-y-3 rounded-2xl p-3">
      <p className="text-xs font-semibold">Редактирование карточки</p>
      <Field label="Название">
        <Input
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Вид спорта">
          <Input
            value={form.sport}
            onChange={(e) => set("sport", e.target.value)}
          />
        </Field>
        <Field label="Город">
          <Input
            value={form.city}
            onChange={(e) => set("city", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Организатор (как показывать)">
        <Input
          value={form.host_name}
          onChange={(e) => set("host_name", e.target.value)}
        />
      </Field>
      <Field label="Место">
        <Input
          value={form.location_text}
          onChange={(e) => set("location_text", e.target.value)}
        />
      </Field>
      <Field label="Ссылка 2ГИС">
        <Input
          value={form.two_gis_url}
          onChange={(e) => set("two_gis_url", e.target.value)}
          placeholder="https://2gis.kz/..."
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Время текстом">
          <Input
            value={form.time_text}
            onChange={(e) => set("time_text", e.target.value)}
            placeholder="Сегодня 20:00"
          />
        </Field>
        <Field label="Дата и время">
          <Input
            type="datetime-local"
            value={form.date_time}
            onChange={(e) => set("date_time", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Запись закрывается">
        <Input
          type="datetime-local"
          value={form.registration_deadline}
          onChange={(e) => set("registration_deadline", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Цена текстом">
          <Input
            value={form.price_text}
            onChange={(e) => set("price_text", e.target.value)}
            placeholder="3000 ₸"
          />
        </Field>
        <Field label="Взнос, ₸ (пусто = бесплатно)">
          <Input
            inputMode="numeric"
            value={form.entry_fee}
            onChange={(e) =>
              set("entry_fee", e.target.value.replace(/[^\d]/g, ""))
            }
          />
        </Field>
      </div>
      <Field label="Ссылка Kaspi организатора">
        <Input
          value={form.kaspi_payment_link}
          onChange={(e) => set("kaspi_payment_link", e.target.value)}
          placeholder="https://pay.kaspi.kz/pay/..."
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Максимум участников">
          <Input
            inputMode="numeric"
            value={form.max_participants}
            onChange={(e) =>
              set("max_participants", e.target.value.replace(/[^\d]/g, ""))
            }
          />
        </Field>
        <Field label="Комиссия, %">
          <Input
            inputMode="numeric"
            disabled={!canEditCommission}
            value={form.commission_percent}
            onChange={(e) =>
              set("commission_percent", e.target.value.replace(/[^\d]/g, ""))
            }
          />
        </Field>
      </div>
      <Field label="Статус">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={form.status === value ? "default" : "secondary"}
              className="press"
              onClick={() => set("status", value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </Field>
      <div className="flex items-center justify-between rounded-xl bg-background/30 px-3 py-2">
        <span className="text-xs">Скрыть из ленты (только по коду)</span>
        <Switch
          checked={form.is_private}
          onCheckedChange={(v) => set("is_private", v)}
        />
      </div>
      <Field label="Описание">
        <Textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Уровень">
          <Input
            value={form.skill_level}
            onChange={(e) => set("skill_level", e.target.value)}
          />
        </Field>
        <Field label="Возраст">
          <Input
            value={form.age_division}
            onChange={(e) => set("age_division", e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Формат">
          <Input
            value={form.format}
            onChange={(e) => set("format", e.target.value)}
          />
        </Field>
        <Field label="Повтор">
          <Input
            value={form.recurrence}
            onChange={(e) => set("recurrence", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Правила отмены">
        <Textarea
          value={form.cancellation_policy}
          onChange={(e) => set("cancellation_policy", e.target.value)}
        />
      </Field>
      <Field label="Заметки для участников">
        <Textarea
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </Field>
      <div className="flex gap-2">
        <Button
          size="sm"
          className="press"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "Сохраняем…" : "Сохранить карточку"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="press"
          onClick={onClose}
        >
          Отмена
        </Button>
      </div>
    </div>
  );
}
