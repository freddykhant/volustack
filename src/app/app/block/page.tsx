import { BlockHeader } from "~/components/block/block-header";
import { BlockGrid } from "~/components/block/block-grid";
import { requireCurrentBlock } from "~/server/mesocycle/current-block";

export default async function BlockPage() {
  const block = await requireCurrentBlock();
  return (
    <div className="flex min-h-full flex-col">
      <BlockHeader block={block} />
      <BlockGrid block={block} />
    </div>
  );
}
