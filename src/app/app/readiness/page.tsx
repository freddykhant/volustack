import { ReadinessScreen } from "~/components/readiness/readiness-screen";
import { readiness } from "~/server/mesocycle/current-block";

export default async function ReadinessPage() {
  const data = await readiness();
  return <ReadinessScreen readiness={data} />;
}
