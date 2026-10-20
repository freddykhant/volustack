import { BlockHeader } from "~/components/block/block-header";
import { BlockGrid } from "~/components/block/block-grid";
import { requireCurrentBlock } from "~/server/mesocycle/current-block";

export default async function BlockPage() {
  const block = await requireCurrentBlock();
  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-10 px-6 pt-10 pb-20 md:px-10">
      <BlockHeader block={block} />
      <BlockGrid block={block} />
    </div>
  );
}
