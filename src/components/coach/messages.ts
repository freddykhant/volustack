/** Why a change cannot be confirmed right now, or null. The coach box's own save is not
 * a reason: its card already disables itself while that is in flight. */
export function blockedReason({
  draftOpen,
  boardSaving,
}: {
  draftOpen: boolean;
  boardSaving: boolean;
}): string | null {
  if (draftOpen) return "Finish or discard your changes first.";
  if (boardSaving) return "Saving your change…";
  return null;
}

/** Only a bad request or a conflict carries a sentence the server wrote for the athlete;
 * anything else gets fixed copy. */
export function confirmErrorText(
  error: { message: string; data?: { code?: string } | null } | null,
): string | null {
  if (error === null) return null;
  const code = error.data?.code;
  if (code === "BAD_REQUEST" || code === "CONFLICT") return error.message;
  return "That didn’t save. Try again.";
}
