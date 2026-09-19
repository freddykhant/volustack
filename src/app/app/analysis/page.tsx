import { AnalysisView } from "~/components/analysis/analysis-view";
import { requireCurrentBlock } from "~/server/mesocycle/current-block";

export default async function AnalysisPage() {
  const block = await requireCurrentBlock();
  return <AnalysisView block={block} />;
}
