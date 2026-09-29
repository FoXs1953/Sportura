import { ReceiptLink } from "@/components/sportura/receipt-link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listPendingPayments, reviewStaffPayment } from "@/lib/admin.functions";
import { toast } from "sonner";
export function StaffPaymentReview() {
  const q = useQuery({
    queryKey: ["admin", "pending-payments"],
    queryFn: () => listPendingPayments(),
  });
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  async function review(id: string, approve: boolean) {
    setBusy(id);
    try {
      await reviewStaffPayment({
        data: { id, approve, note: notes[id] || "" },
      });
      await qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Платёж рассмотрен");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="workspace-panel mb-6">
      <h2 className="font-semibold">Подтверждения на проверке</h2>
      <p className="my-2 text-sm text-muted-foreground">
        Подтверждайте только после сверки поступления денег. Это действие
        отмечает оплату и не переводит средства.
      </p>
      {q.isError ? (
        <p role="alert">{q.error.message}</p>
      ) : q.isPending ? (
        <p>Загрузка…</p>
      ) : !q.data?.length ? (
        <p>Нет платежей на проверке.</p>
      ) : (
        q.data.map((r) => (
          <article key={r.id} className="border-t border-white/10 py-4">
            <strong>{r.activity?.title}</strong>
            {r.receipt_url && <ReceiptLink path={r.receipt_url} />}
            <p className="my-2 text-sm">
              Номер платежа: {r.payment_reference || "не указан"}
            </p>
            <label className="text-sm">
              Комментарий
              <input
                className="workspace-input block"
                value={notes[r.id] || ""}
                maxLength={600}
                onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
              />
            </label>
            <div className="mt-3 flex gap-2">
              <button
                disabled={busy !== null}
                className="feed-chip"
                onClick={() => review(r.id, true)}
              >
                Подтвердить оплату
              </button>
              <button
                disabled={busy !== null}
                className="feed-chip"
                onClick={() => review(r.id, false)}
              >
                Отклонить
              </button>
            </div>
          </article>
        ))
      )}
    </section>
  );
}
