import { create } from "zustand";

export type ModalKind =
  | { type: "create-trip" }
  | { type: "edit-trip"; tripId: string }
  | { type: "create-activity"; tripId: string; dayDate: string }
  | { type: "edit-activity"; activityId: string }
  | { type: "add-expense"; tripId: string };

interface DragState {
  activeActivityId: string | null;
  overDayDate: string | null;
}

/**
 * Transient, non-persisted UI state ONLY (open modals, in-flight drag
 * state, etc). Domain data (trips/activities/expenses) must never be stored
 * here — Dexie is the single source of truth for that, per the app's
 * architecture rules.
 */
interface UiState {
  activeModal: ModalKind | null;
  openModal: (modal: ModalKind) => void;
  closeModal: () => void;

  drag: DragState;
  beginDrag: (activityId: string) => void;
  setDragOverDay: (dayDate: string | null) => void;
  endDrag: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeModal: null,
  openModal: (modal) => set({ activeModal: modal }),
  closeModal: () => set({ activeModal: null }),

  drag: { activeActivityId: null, overDayDate: null },
  beginDrag: (activityId) =>
    set({ drag: { activeActivityId: activityId, overDayDate: null } }),
  setDragOverDay: (dayDate) =>
    set((state) => ({ drag: { ...state.drag, overDayDate: dayDate } })),
  endDrag: () => set({ drag: { activeActivityId: null, overDayDate: null } }),
}));
