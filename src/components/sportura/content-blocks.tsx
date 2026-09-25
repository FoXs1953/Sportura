import type { ContentBlock } from "@/lib/cms.functions";

function Cta({ label, url }: { label?: string | null; url?: string | null }) {
  if (!label || !url) return null;
  const external = /^https?:\/\//.test(url);
  return (
    <a
      href={url}
      {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
      className="press mt-3 inline-flex rounded-full bg-brand px-4 py-2 text-xs font-semibold text-primary-foreground"
    >
      {label}
    </a>
  );
}

function Block({ block }: { block: ContentBlock }) {
  if (block.kind === "hero") {
    return (
      <section className="panel-frost overflow-hidden rounded-3xl">
        {block.image_url ? (
          <img src={block.image_url} alt={block.title ?? ""} className="h-40 w-full object-cover" />
        ) : null}
        <div className="p-5">
          {block.title ? <h2 className="font-display text-xl leading-tight">{block.title}</h2> : null}
          {block.subtitle ? (
            <p className="mt-1 text-sm text-muted-foreground">{block.subtitle}</p>
          ) : null}
          {block.body ? <p className="mt-2 text-sm whitespace-pre-line">{block.body}</p> : null}
          <Cta label={block.cta_label} url={block.cta_url} />
        </div>
      </section>
    );
  }

  if (block.kind === "banner") {
    return (
      <section className="rounded-2xl bg-brand/15 px-4 py-3 text-sm">
        {block.title ? <p className="font-semibold">{block.title}</p> : null}
        {block.body ? <p className="text-muted-foreground">{block.body}</p> : null}
        <Cta label={block.cta_label} url={block.cta_url} />
      </section>
    );
  }

  if (block.kind === "cards") {
    return (
      <section className="space-y-3">
        {block.title ? <h2 className="font-display text-lg">{block.title}</h2> : null}
        <div className="grid gap-3">
          {block.items.map((item, i) => (
            <div key={i} className="panel-frost-2 rounded-2xl p-4">
              {item.title ? <p className="text-sm font-semibold">{item.title}</p> : null}
              {item.text ? (
                <p className="mt-1 text-xs whitespace-pre-line text-muted-foreground">{item.text}</p>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (block.kind === "faq") {
    return (
      <section className="panel-frost space-y-3 rounded-2xl p-5">
        {block.title ? <h2 className="font-display text-lg">{block.title}</h2> : null}
        {block.items.map((item, i) => (
          <details key={i} className="border-b border-border/40 pb-2 last:border-0">
            <summary className="cursor-pointer text-sm font-semibold">{item.title}</summary>
            <p className="mt-1 text-xs whitespace-pre-line text-muted-foreground">{item.text}</p>
          </details>
        ))}
      </section>
    );
  }

  if (block.kind === "cta") {
    return (
      <section className="panel-frost rounded-2xl p-5 text-center">
        {block.title ? <p className="text-sm font-semibold">{block.title}</p> : null}
        {block.body ? <p className="mt-1 text-xs text-muted-foreground">{block.body}</p> : null}
        <Cta label={block.cta_label} url={block.cta_url} />
      </section>
    );
  }

  return (
    <section className="panel-frost rounded-2xl p-5">
      {block.title ? <h2 className="font-display text-lg">{block.title}</h2> : null}
      {block.subtitle ? <p className="text-xs text-muted-foreground">{block.subtitle}</p> : null}
      {block.body ? <p className="mt-2 text-sm whitespace-pre-line">{block.body}</p> : null}
      <Cta label={block.cta_label} url={block.cta_url} />
    </section>
  );
}

export function ContentBlocks({ blocks }: { blocks: ContentBlock[] }) {
  if (blocks.length === 0) return null;
  return (
    <div className="space-y-3">
      {blocks.map((b) => (
        <Block key={b.id} block={b} />
      ))}
    </div>
  );
}
