import { notFound } from "next/navigation";
import { BlockHeader } from "~/components/block/block-header";
import { BlockGrid } from "~/components/block/block-grid";
import { EmptyBlockState } from "~/components/app/empty-block-state";
import { api } from "~/trpc/server";

export default async function BlockPage({ params }: { params: Promise<{ blockId: string }> }) {
  const { blockId } = await params;
  const block = await api.mesocycle.getCurrentBlock();
  if (!block) return <EmptyBlockState />;
  if (blockId !== block.id) notFound();
  return (
    <div className="flex min-h-full flex-col">
      <BlockHeader block={block} />
      <BlockGrid block={block} />
    </div>
  );
}
