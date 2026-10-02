import { useEffect, useRef, useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type MyProfile } from "@/lib/me.functions";
import { updateMyAvatar, updateMyContact } from "@/lib/profile.functions";
import {
  getAuthCapabilities,
  requestEmailChange,
  resendConfirmation,
} from "@/lib/auth.functions";
import { type ProfileWorkspace, positions, levels } from "@/lib/profile-model";
import {
  uploadAvatar,
  signedAvatarUrl,
  deleteFiles,
  AVATARS_BUCKET,
} from "@/lib/storage";
import { SPORTS, CITIES } from "@/lib/sportura";
import { normalizeKzPhone, KZ_PHONE_MESSAGE } from "@/lib/kz-validation";
import {
  Panel,
  SaveRow,
  ErrorNotice,
  useSectionForm,
  useProfileForm,
  errorText,
} from "./shared";

export function AvatarEditor({ me }: { me: MyProfile }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [source, setSource] = useState("");
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    if (me.avatar_url)
      void signedAvatarUrl(me.avatar_url)
        .then((u) => {
          if (live) setUrl(u);
        })
        .catch(() => {
          if (live) setUrl("");
        });
    else setUrl("");
    return () => {
      live = false;
    };
  }, [me.avatar_url]);
  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source);
    },
    [source],
  );
  async function apply() {
    setBusy(true);
    setError("");
    let uploaded: string | undefined;
    try {
      const img = new Image();
      img.src = source;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Браузер не поддерживает обработку фото");
      const size = Math.min(img.width, img.height) / zoom;
      ctx.drawImage(
        img,
        ((img.width - size) * x) / 100,
        ((img.height - size) * y) / 100,
        size,
        size,
        0,
        0,
        512,
        512,
      );
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9),
      );
      if (!blob) throw new Error("Не удалось обработать фото");
      uploaded = await uploadAvatar(
        new File([blob], "avatar.jpg", { type: "image/jpeg" }),
      );
      await updateMyAvatar({ data: { path: uploaded } });
      setSource("");
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Фото обновлено");
    } catch (e) {
      setError(errorText(e));
      if (uploaded) await deleteFiles(AVATARS_BUCKET, [uploaded]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid size-20 place-items-center overflow-hidden rounded-2xl bg-[#30393c] text-2xl">
          {url ? (
            <img src={url} alt="Ваше фото" className="size-full object-cover" />
          ) : (
            me.name.slice(0, 1)
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => input.current?.click()}>
            <Camera size={16} /> {url ? "Заменить фото" : "Загрузить фото"}
          </Button>
          {me.avatar_url && (
            <Button
              variant="ghost"
              disabled={busy}
              aria-label="Удалить фото"
              onClick={async () => {
                setBusy(true);
                try {
                  await updateMyAvatar({ data: { path: null } });
                  await qc.invalidateQueries({ queryKey: ["me"] });
                  toast.success("Фото удалено");
                } catch (e) {
                  setError(errorText(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Trash2 size={16} />
            </Button>
          )}
        </div>
      </div>
      <p className="workspace-muted mt-3 text-xs">
        JPG, PNG или WebP до 5 МБ. Выберите область перед сохранением.
      </p>
      <input
        ref={input}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (
            file.size > 5 * 1024 * 1024 ||
            !["image/jpeg", "image/png", "image/webp"].includes(file.type)
          ) {
            setError("Выберите JPG, PNG или WebP до 5 МБ");
            return;
          }
          setError("");
          setZoom(1);
          setX(50);
          setY(50);
          setSource(URL.createObjectURL(file));
        }}
      />
      <ErrorNotice message={source ? "" : error} />
      <Dialog
        open={!!source}
        onOpenChange={(open) => {
          if (!open && !busy) setSource("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Фото профиля</DialogTitle>
            <DialogDescription>
              Настройте масштаб и положение кадра.
            </DialogDescription>
          </DialogHeader>
          <CropPreview source={source} zoom={zoom} x={x} y={y} />
          <label>
            Масштаб
            <input
              aria-label="Масштаб"
              type="range"
              min="1"
              max="3"
              step=".05"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </label>
          <label>
            По горизонтали
            <input
              aria-label="По горизонтали"
              type="range"
              value={x}
              onChange={(e) => setX(Number(e.target.value))}
            />
          </label>
          <label>
            По вертикали
            <input
              aria-label="По вертикали"
              type="range"
              value={y}
              onChange={(e) => setY(Number(e.target.value))}
            />
          </label>
          <ErrorNotice message={error} />
          <Button disabled={busy} onClick={() => void apply()}>
            {busy ? "Загружаем…" : "Использовать фото"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function CropPreview({
  source,
  zoom,
  x,
  y,
}: {
  source: string;
  zoom: number;
  x: number;
  y: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    const img = new Image();
    img.src = source;
    void img
      .decode()
      .then(() => {
        if (!live) return;
        const ctx = canvas.current?.getContext("2d");
        if (!ctx) return;
        const size = Math.min(img.width, img.height) / zoom;
        ctx.clearRect(0, 0, 300, 300);
        ctx.drawImage(
          img,
          ((img.width - size) * x) / 100,
          ((img.height - size) * y) / 100,
          size,
          size,
          0,
          0,
          300,
          300,
        );
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [source, zoom, x, y]);
  return (
    <canvas
      ref={canvas}
      width={300}
      height={300}
      className="mx-auto max-w-full rounded-2xl"
      aria-label="Предпросмотр кадра"
    />
  );
}
export function PersonalTab({
  me,
  data,
}: {
  me: MyProfile;
  data: ProfileWorkspace;
}) {
  const basic = useSectionForm(
    "basic",
    {
      name: me.name,
      city: me.city,
      bio: data.preferences.bio,
      district: data.preferences.district,
    },
    "basic",
  );
  const sports = useSectionForm(
    "sports",
    {
      skills: data.preferences.skills.length
        ? data.preferences.skills
        : me.sports.map((sport) => ({
            sport,
            level: "amateur" as const,
            position: "Любая",
          })),
      days: data.preferences.days,
      time_from: data.preferences.time_from,
      time_to: data.preferences.time_to,
      event_types: data.preferences.event_types,
    },
    "sports",
  );
  return (
    <>
      <Panel
        title="Личные данные"
        subtitle="Имя и город видны в публичном профиле. Район — только вам."
      >
        <AvatarEditor me={me} />
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label>
            Имя и фамилия
            <Input
              value={basic.value.name}
              minLength={2}
              maxLength={80}
              autoComplete="name"
              onChange={(e) => basic.patch({ name: e.target.value })}
            />
            {basic.value.name.trim().length < 2 && (
              <small className="text-destructive">
                Укажите не менее 2 символов
              </small>
            )}
          </label>
          <label>
            Город
            <select
              value={basic.value.city}
              onChange={(e) => basic.patch({ city: e.target.value })}
            >
              {[...new Set([...CITIES, me.city])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Район · необязательно
            <Input
              value={basic.value.district}
              maxLength={80}
              onChange={(e) => basic.patch({ district: e.target.value })}
            />
          </label>
        </div>
        <label className="mt-5">
          О себе · необязательно
          <Textarea
            value={basic.value.bio}
            maxLength={600}
            rows={4}
            onChange={(e) => basic.patch({ bio: e.target.value })}
          />
          <small>
            {basic.value.bio.length}/600 · Видимость меняется в разделе
            безопасности.
          </small>
        </label>
        <SaveRow form={basic} />
      </Panel>
      <Contacts me={me} data={data} />
      <Panel
        title="Спортивный профиль"
        subtitle="Выберите виды спорта и удобное время. Эти настройки помогут подобрать события в ленте."
      >
        <div className="flex flex-wrap gap-2">
          {SPORTS.map((sport) => (
            <button
              key={sport}
              className={`feed-chip ${sports.value.skills.some((s) => s.sport === sport) ? "is-active" : ""}`}
              aria-pressed={sports.value.skills.some((s) => s.sport === sport)}
              onClick={() =>
                sports.patch({
                  skills: sports.value.skills.some((s) => s.sport === sport)
                    ? sports.value.skills.filter((s) => s.sport !== sport)
                    : [
                        ...sports.value.skills,
                        { sport, level: "amateur", position: "Любая" },
                      ],
                })
              }
            >
              {sport}
            </button>
          ))}
        </div>
        {sports.value.skills.map((skill, index) => (
          <div
            className="profile-item grid gap-3 sm:grid-cols-[1fr_1fr_1fr]"
            key={skill.sport}
          >
            <strong className="self-center text-sm">{skill.sport}</strong>
            <label>
              Уровень
              <select
                value={skill.level}
                onChange={(e) =>
                  sports.patch({
                    skills: sports.value.skills.map((s, i) =>
                      i === index
                        ? { ...s, level: e.target.value as typeof skill.level }
                        : s,
                    ),
                  })
                }
              >
                {Object.entries(levels).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Позиция
              <select
                value={skill.position}
                onChange={(e) =>
                  sports.patch({
                    skills: sports.value.skills.map((s, i) =>
                      i === index ? { ...s, position: e.target.value } : s,
                    ),
                  })
                }
              >
                {positions[skill.sport]?.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>
        ))}
        <h3 className="mb-3 mt-6 text-sm font-bold">Удобные дни</h3>
        <div className="flex flex-wrap gap-2">
          {["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"].map((day, i) => (
            <button
              key={day}
              className={`feed-chip ${sports.value.days.includes(i) ? "is-active" : ""}`}
              aria-pressed={sports.value.days.includes(i)}
              onClick={() =>
                sports.patch({
                  days: sports.value.days.includes(i)
                    ? sports.value.days.filter((d) => d !== i)
                    : [...sports.value.days, i],
                })
              }
            >
              {day}
            </button>
          ))}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label>
            С · время Казахстана
            <Input
              type="time"
              value={sports.value.time_from}
              onChange={(e) => sports.patch({ time_from: e.target.value })}
            />
          </label>
          <label>
            До
            <Input
              type="time"
              value={sports.value.time_to}
              onChange={(e) => sports.patch({ time_to: e.target.value })}
            />
          </label>
        </div>
        {sports.value.time_from >= sports.value.time_to && (
          <ErrorNotice message="Время окончания должно быть позже начала" />
        )}
        <h3 className="mb-3 mt-6 text-sm font-bold">Форматы</h3>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["daily_game", "Игры"],
              ["tournament", "Турниры"],
              ["league", "Лиги"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              className={`feed-chip ${sports.value.event_types.includes(v) ? "is-active" : ""}`}
              aria-pressed={sports.value.event_types.includes(v)}
              onClick={() =>
                sports.patch({
                  event_types: sports.value.event_types.includes(v)
                    ? sports.value.event_types.filter((t) => t !== v)
                    : [...sports.value.event_types, v],
                })
              }
            >
              {label}
            </button>
          ))}
        </div>
        <SaveRow form={sports} />
      </Panel>
    </>
  );
}
function Contacts({ me, data }: { me: MyProfile; data: ProfileWorkspace }) {
  const capabilities = useQuery({
    queryKey: ["auth-capabilities"],
    queryFn: () => getAuthCapabilities(),
  });
  const emailUnavailable = capabilities.data?.email === false;
  const form = useProfileForm(
    "contact",
    { phone: me.phone ?? "" },
    async (value) => {
      const phone = value.phone.trim() ? normalizeKzPhone(value.phone) : "";
      if (phone === null) throw new Error(KZ_PHONE_MESSAGE);
      return updateMyContact({ data: { phone: phone ?? "" } });
    },
  );
  const [email, setEmail] = useState(me.email ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const qc = useQueryClient();
  async function run(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    try {
      await fn();
      toast.success(success);
      await qc.invalidateQueries({ queryKey: ["profile-workspace"] });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const phone = normalizeKzPhone(form.value.phone);
  const confirmed =
    data.phone_confirmed &&
    phone?.replace("+", "") === data.auth_phone?.replace("+", "");
  return (
    <Panel
      title="Контакты"
      subtitle="Email и телефон не публикуются. Телефон доступен организатору события, на которое вы записаны, и администратору."
    >
      <div className="grid gap-5">
        <label>
          Email{" "}
          <span
            className={`workspace-tag ${data.email_confirmed ? "is-success" : "is-warning"}`}
          >
            {data.email_confirmed ? "Подтверждён" : "Не подтверждён"}
          </span>
          <Input
            type="email"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={
              busy ||
              emailUnavailable ||
              email === me.email ||
              !/.+@.+\..+/.test(email)
            }
            onClick={() =>
              void run(
                () => requestEmailChange({ data: { email } }),
                "Письмо для подтверждения отправлено на новый адрес.",
              )
            }
          >
            Изменить email
          </Button>
          {!data.email_confirmed && me.email && (
            <Button
              variant="ghost"
              disabled={busy || emailUnavailable}
              onClick={() =>
                void run(() => resendConfirmation(), "Письмо отправлено")
              }
            >
              Отправить подтверждение
            </Button>
          )}
        </div>
        {emailUnavailable && (
          <p role="status" className="workspace-muted text-sm">
            Отправка писем пока недоступна. Подтвердить или изменить e-mail
            можно будет позже.
          </p>
        )}
        <label>
          Контактный телефон{" "}
          <span
            className={`workspace-tag ${confirmed ? "is-success" : "is-warning"}`}
          >
            {confirmed ? "Подтверждён SMS" : "Не подтверждён SMS"}
          </span>
          <Input
            type="tel"
            autoComplete="tel"
            value={form.value.phone}
            placeholder="+7 7__ ___ __ __"
            onChange={(e) => form.patch({ phone: e.target.value })}
          />
          {form.value.phone && !phone && (
            <small className="text-destructive">{KZ_PHONE_MESSAGE}</small>
          )}
        </label>
      </div>
      <SaveRow form={form} />
      {!confirmed && (
        <div className="mt-5">
          <p className="workspace-muted mb-3 text-xs">
            SMS-подтверждение доступно после подключения оператора рассылки.
            Контактный телефон можно сохранить без SMS.
          </p>
        </div>
      )}
      <ErrorNotice message={error} />
    </Panel>
  );
}
