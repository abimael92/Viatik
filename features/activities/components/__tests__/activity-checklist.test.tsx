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
  it("adds, renames, and deletes checklist items", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ActivityChecklistEditor checklist={[]} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add sub-task" }));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ title: "New task", completed: false, archived: false }),
    ]);

    const checklist = [{ id: "item-1", title: "Buy tickets", completed: false, archived: false }];
    rerender(<ActivityChecklistEditor checklist={checklist} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Task 1 title"), { target: { value: "Buy museum tickets" } });
    expect(onChange).toHaveBeenLastCalledWith([
      { id: "item-1", title: "Buy museum tickets", completed: false, archived: false },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Remove task 1" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});

describe("ActivityChecklistQuickActions", () => {
  it("marks items done and archives with feed events; no structure controls", () => {
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

    expect(screen.queryByRole("button", { name: /add sub-task/i })).toBeNull();
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
  });

  it("unchecks without emitting a feed event", () => {
    const onChange = vi.fn();
    render(
      <ActivityChecklistQuickActions
        checklist={[{ id: "item-1", title: "Buy tickets", completed: true, archived: false }]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Buy tickets" }));
    expect(onChange).toHaveBeenCalledWith([
      { id: "item-1", title: "Buy tickets", completed: false, archived: false },
    ]);
    expect(onChange.mock.calls[0]).toHaveLength(1);
  });
});

describe("ActivityChecklistProgressPill", () => {
  it("renders a textual progress summary for active tasks", () => {
    render(
      <ActivityChecklistProgressPill
        checklist={[
          { id: "item-1", title: "Buy tickets", completed: true, archived: false },
          { id: "item-2", title: "Meet guide", completed: false, archived: false },
          { id: "item-3", title: "Skip me", completed: false, archived: true },
        ]}
      />,
    );
    expect(screen.getByLabelText("1 of 2 tasks completed").textContent).toContain("1/2 tasks completed");
  });
});
