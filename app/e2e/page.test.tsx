import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }) }));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/app/e2e/e2e-client", () => ({ E2EClient: () => null }));

import E2EPage from "@/app/e2e/page";

describe("E2E route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("terminates with notFound in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => E2EPage()).toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });

  it("renders the harness outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(E2EPage()).not.toBeNull();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
