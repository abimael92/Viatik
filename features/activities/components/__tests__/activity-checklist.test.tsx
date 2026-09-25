import { fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  ActivityChecklistEditor,
  ActivityChecklistProgressPill,
  ActivityChecklistQuickActions,
} from "@/features/activities/components/activity-checklist";

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: PropsWithChildren) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: PropsWithChildren) => <>{children}</>,
  DropdownMenuContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
  DropdownMenuGroup: ({ children }: PropsWithChildren) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: PropsWithChildren) => <span>{children}</span>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({ children, onSelect }: PropsWithChildren<{ onSelect?: () => void }>) => (
    <button type="button" role="menuitem" onClick={onSelect}>{children}</button>
  ),
}));

describe("ActivityChecklistEditor", () => {
  it("adds, renames, and deletes Must-dos", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ActivityChecklistEditor checklist={[]} onChange={onChange} />,
    );

    expect(screen.getByText("Must-dos")).toBeTruthy();
    expect(screen.getByText("No Must-dos yet. Add the first one for this activity.")).toBeTruthy();
    const addMustDo = screen.getByRole("button", { name: "Add Must-do" });
    expect(addMustDo.className).toContain("from-lime-300");
    fireEvent.click(addMustDo);
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ title: "New Must-do", completed: false, archived: false }),
    ]);

    const checklist = [{ id: "item-1", title: "Buy tickets", completed: false, archived: false }];
    rerender(<ActivityChecklistEditor checklist={checklist} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Must-do 1 title"), { target: { value: "Buy museum tickets" } });
    expect(onChange).toHaveBeenLastCalledWith([
      { id: "item-1", title: "Buy museum tickets", completed: false, archived: false },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Remove Must-do 1" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});

describe("ActivityChecklistQuickActions", () => {
  it("marks items done, archives, and deletes with feed events; no add control", () => {
    const onChange = vi.fn();
    render(
      <ActivityChecklistQuickActions
        checklist={[
          { id: "item-1", title: "Buy tickets", completed: false, archived: false },
          { id: "item-2", title: "Meet guide", completed: true, archived: false },
        ]}
        onChange={onChange}
      />,
    );

    expect(screen.queryByRole("button", { name: /add must-do/i })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Buy tickets" }));
    expect(onChange).toHaveBeenCalledWith(
      [
        { id: "item-1", title: "Buy tickets", completed: true, archived: false },
        { id: "item-2", title: "Meet guide", completed: true, archived: false },
      ],
      { action: "completed_checklist_item", itemTitle: "Buy tickets" },
    );

    fireEvent.click(screen.getByRole("button", { name: "Archive Buy tickets" }));
    expect(onChange).toHaveBeenLastCalledWith(
      [
        { id: "item-1", title: "Buy tickets", completed: false, archived: true },
        { id: "item-2", title: "Meet guide", completed: true, archived: false },
      ],
      { action: "skipped_checklist_item", itemTitle: "Buy tickets" },
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Buy tickets" }));
    expect(onChange).toHaveBeenLastCalledWith(
      [{ id: "item-2", title: "Meet guide", completed: true, archived: false }],
      { action: "deleted_checklist_item", itemTitle: "Buy tickets" },
    );
  });

  it("broadcasts a feed event when a completed item is reopened", () => {
    const onChange = vi.fn();
    render(
      <ActivityChecklistQuickActions
        checklist={[{ id: "item-1", title: "Buy tickets", completed: true, archived: false }]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Buy tickets" }));
    expect(onChange).toHaveBeenCalledWith(
      [{ id: "item-1", title: "Buy tickets", completed: false, archived: false }],
      { action: "reopened_checklist_item", itemTitle: "Buy tickets" },
    );
  });

  it("allows archived Must-dos to be restored or deleted", () => {
    const onChange = vi.fn();
    render(
      <ActivityChecklistQuickActions
        checklist={[{ id: "item-1", title: "Buy tickets", completed: false, archived: true }]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Archived (1)" }));
    expect(screen.getByRole("button", { name: "Restore Buy tickets" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete Buy tickets" }));
    expect(onChange).toHaveBeenCalledWith(
      [],
      { action: "deleted_checklist_item", itemTitle: "Buy tickets" },
    );
  });
});

describe("ActivityChecklistProgressPill", () => {
  it("renders a textual Must-do progress summary", () => {
    render(
      <ActivityChecklistProgressPill
        checklist={[
          { id: "item-1", title: "Buy tickets", completed: true, archived: false },
          { id: "item-2", title: "Meet guide", completed: false, archived: false },
          { id: "item-3", title: "Skip me", completed: false, archived: true },
        ]}
      />,
    );
    expect(screen.getByLabelText("1 of 2 Must-dos complete").textContent).toContain("1/2 Must-dos complete");
  });
});
