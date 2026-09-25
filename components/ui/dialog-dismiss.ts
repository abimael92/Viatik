/** Portaled place results and menus must not dismiss a parent Dialog. */
export function isDialogDismissExempt(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest("[data-places-suggestions]") ||
      target.closest(".pac-container") ||
      target.closest("[data-radix-popper-content-wrapper]") ||
      target.closest("[role='menu']"),
  );
}
