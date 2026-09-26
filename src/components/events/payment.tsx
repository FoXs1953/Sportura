import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ReceiptLink } from "@/components/sportura/receipt-link";
import { uploadReceipt } from "@/lib/storage";
import type { Registration } from "@/lib/event-model";
import { PAYMENT_STATUS_LABEL, formatKzt } from "@/lib/sportura";
import { useEventAction, HelpLink, ErrorNotice, dateLabel } from "./shared";
import { mutateEvent } from "@/lib/event.functions";
export function PaymentPanel({
  registration: r,
}: {
  registration: Registration;
}) {
  const action = useEventAction();
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const free = r.amount_due === 0;
  const price = r.amount_due;
  const a = r.activity;
  const link = r.terms_snapshot?.kaspi_payment_link ?? a.kaspi_payment_link;
  const canSubmit =
    !free &&
    r.status === "registered" &&
    a.status !== "cancelled" &&
    ["pending", "rejected"].includes(r.payment_status);
  function choose(f: File | undefined) {
    setError("");
    if (!f) return;
    if (
      !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(
        f.type,
      ) ||
      f.size > 10 * 1024 * 1024
    ) {
      setError("Выберите JPG, PNG, WebP или PDF до 10 МБ");
      return;
    }
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(f));
  }
  return (
    <div className="space-y-4">
      <div className="event-line">
        <strong>
          {free
            ? "Бесплатно"
            : price === null
              ? "Исходная сумма не зафиксирована"
              : formatKzt(price)}
        </strong>
        <span className="workspace-tag">
          {free
            ? "Оплата не требуется"
            : PAYMENT_STATUS_LABEL[r.payment_status]}
        </span>
      </div>
      {price === null && (
        <p className="workspace-muted text-xs">
          Для старой записи уточните сумму у организатора. Текущая цена события
          может отличаться.
        </p>
      )}
      {r.payment_note && (
        <p className="feed-notice">
          Комментарий организатора: {r.payment_note}
        </p>
      )}
      {canSubmit && (
        <>
          {link && /^https:\/\/pay\.kaspi\.kz\/pay\//.test(link) && (
            <a
              className="workspace-primary-link"
              href={link}
              target="_blank"
              rel="noreferrer"
            >
              Открыть оплату Kaspi ↗
            </a>
          )}
          <p className="workspace-muted text-xs">
            Перевод проверяет организатор. Перед оплатой проверьте получателя в
            Kaspi.
          </p>
          <label>
            Номер или код перевода
            <Input
              value={reference}
              maxLength={120}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
          <label>
            Комментарий
            <Textarea
              value={note}
              maxLength={400}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <label>
            Чек · изображение или PDF до 10 МБ
            <input
              className="event-file"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => choose(e.target.files?.[0])}
            />
          </label>
          {file && (
            <div className="event-proof">
              {file.type.startsWith("image/") ? (
                <img src={preview} alt="Предпросмотр чека" />
              ) : (
                <a href={preview} target="_blank" rel="noreferrer">
                  Предпросмотр PDF: {file.name}
                </a>
              )}
            </div>
          )}
          <ErrorNotice message={error || action.error} />
          <Button
            disabled={action.busy || reference.trim().length < 2}
            onClick={() =>
              void action.run(async () => {
                const path = file ? await uploadReceipt(file, r.id) : null;
                await mutateEvent({
                  data: {
                    action: "proof",
                    payload: {
                      registration_id: r.id,
                      payment_reference: reference.trim(),
                      note,
                      receipt_url: path,
                    },
                  },
                });
                setReference("");
                setNote("");
                setFile(null);
                if (preview) URL.revokeObjectURL(preview);
                setPreview("");
              }, "Чек отправлен на проверку")
            }
          >
            {action.busy
              ? "Отправляем…"
              : r.payment_status === "rejected"
                ? "Отправить исправленный чек"
                : "Я оплатил — отправить на проверку"}
          </Button>
          <p className="workspace-muted text-xs">
            Чек доступен вам, организатору этой игры и администратору.
          </p>
        </>
      )}
      {r.receipt_url && <ReceiptLink path={r.receipt_url} />}
      {!!r.proofs?.length && (
        <details>
          <summary>История отправок · {r.proofs.length}</summary>
          <div className="space-y-3 mt-3">
            {r.proofs.map((p) => (
              <div className="profile-item" key={p.id}>
                <p>
                  {dateLabel(p.created_at, true)} · {p.payment_reference}
                </p>
                {p.note && <p>{p.note}</p>}
                {p.receipt_url && <ReceiptLink path={p.receipt_url} />}
              </div>
            ))}
          </div>
        </details>
      )}
      <HelpLink registration={r.id} topic="payment" />
    </div>
  );
}
