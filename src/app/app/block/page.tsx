import { redirect } from "next/navigation";
import { mockMesocycle } from "~/views/_fixtures/mock-block";

export default function BlockIndex() {
  redirect(`/app/block/${mockMesocycle.id}`);
}
