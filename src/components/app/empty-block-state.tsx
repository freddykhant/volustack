/**
 * Rendered by every block surface when the signed-in user has no ACTIVE
 * mesocycle. Deliberately calm and monochrome — onboarding (which will create a
 * block) arrives in sub-project ②, so this only gestures toward it.
 */
export function EmptyBlockState() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-[420px] flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-section text-fg">No active block yet</h1>
      <p className="text-card-desc text-fg-muted">
        Once you have a training block, your week, sessions, and volume will show up here.
      </p>
    </div>
  );
}
