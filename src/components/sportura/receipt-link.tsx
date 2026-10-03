import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import { toast } from "sonner";
import { signedReceiptUrl } from "@/lib/storage";
export function ReceiptLink({ path }: { path: string }) {
  const { tr } = useI18n();
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    try {
      const url = await signedReceiptUrl(path);
      window.open(url, "_blank", "noreferrer");
    } catch (err) {
      toast.error(tr(err instanceof Error ? err.message : "Чек недоступен"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={open}
      className="press mt-1 text-[11px] font-semibold text-brand underline disabled:opacity-60"
    >
      {tr(busy ? "Открываем чек…" : "Открыть чек")}
    </button>
  );
}
