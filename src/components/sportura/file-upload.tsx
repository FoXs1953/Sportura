import { useI18n } from "@/lib/i18n";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Paperclip } from "lucide-react";
type Props = {
  label: string;
  accept?: string;
  onUpload: (file: File) => Promise<void>;
};
export function FileUploadButton({
  label,
  accept = "image/*",
  onUpload,
}: Props) {
  const { tr } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function handle(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      await onUpload(file);
    } catch (err) {
      toast.error(
        tr(err instanceof Error ? err.message : "Не удалось загрузить файл"),
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="press panel-frost-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
      >
        <Paperclip className="size-4" />
        {tr(busy ? "Загружаем…" : label)}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => void handle(e.target.files?.[0])}
      />
    </>
  );
}
