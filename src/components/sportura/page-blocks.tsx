import { useQuery } from "@tanstack/react-query";
import { ContentBlocks } from "./content-blocks";
import { getSiteContent } from "@/lib/cms.functions";

/** Renders admin-managed blocks for any page (client-side fetch). */
export function PageBlocks({ page }: { page: string }) {
  const { data } = useQuery({
    queryKey: ["site", page],
    queryFn: () => getSiteContent({ data: { page } }),
  });
  if (!data || data.blocks.length === 0) return null;
  return (
    <div className="mb-4">
      <ContentBlocks blocks={data.blocks} />
    </div>
  );
}
