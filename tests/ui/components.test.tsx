// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import AppShell from "@/app/components/shell/AppShell";
import { isNavActive, navGroups } from "@/app/components/shell/nav";
import { OptionCards } from "@/app/components/ui";
import { PreflightScreen } from "@/app/interview/components/LiveParts";
import InterviewSetupClient from "@/app/interview/setup/InterviewSetupClient";
import { DETAILS_KEY, parseDetails } from "@/app/lib/interviewStorage";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("interview configuration storage", () => {
  it("round-trips the Mixed type and Adaptive difficulty", () => {
    const parsed = parseDetails(JSON.stringify({ type: "Mixed", difficulty: "Adaptive", role: "SRE", interactionMode: "video" }));
    expect(parsed).toMatchObject({ type: "Mixed", difficulty: "Adaptive", role: "SRE", interactionMode: "video" });
  });

  it("falls back safely for corrupted storage", () => {
    expect(parseDetails("{not json")).toBeNull();
    expect(parseDetails(JSON.stringify({ type: "Weird", difficulty: 5 }))).toMatchObject({ type: "Mixed", difficulty: "Adaptive" });
  });
});

describe("navigation", () => {
  it("marks the current route as active", () => {
    const items = navGroups(false).flatMap((g) => g.items);
    const history = items.find((i) => i.href === "/history")!;
    const dashboard = items.find((i) => i.href === "/")!;
    const interview = items.find((i) => i.href === "/interview/setup")!;
    expect(isNavActive(history, "/history/interviews/abc")).toBe(true);
    expect(isNavActive(dashboard, "/history")).toBe(false);
    expect(isNavActive(dashboard, "/")).toBe(true);
    expect(isNavActive(interview, "/interview/setup")).toBe(true);
  });

  it("only shows the admin link to admins", () => {
    expect(navGroups(false).flatMap((g) => g.items).some((i) => i.href === "/admin")).toBe(false);
    expect(navGroups(true).flatMap((g) => g.items).some((i) => i.href === "/admin")).toBe(true);
  });

  it("renders the shell with aria-current on the active link and a working mobile drawer", () => {
    nav.pathname = "/contests";
    render(
      <AppShell user={{ name: "Ada Lovelace", email: "ada@example.com", isAdmin: false }}>
        <p>content</p>
      </AppShell>,
    );
    const mainNav = screen.getAllByRole("navigation", { name: "Main" })[0];
    expect(within(mainNav).getByRole("link", { name: "Contests" }).getAttribute("aria-current")).toBe("page");

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const drawer = screen.getByRole("dialog", { name: "Navigation" });
    expect(drawer).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Navigation" })).toBeNull();
  });

  it("hides the sidebar during a live interview", () => {
    nav.pathname = "/interview";
    render(
      <AppShell user={{ name: "Ada", email: "ada@example.com", isAdmin: false }}>
        <p>live</p>
      </AppShell>,
    );
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
    expect(screen.getByText("live")).toBeTruthy();
  });
});

describe("option cards", () => {
  function Harness() {
    const [value, setValue] = useState<"HR" | "Technical" | "Mixed">("HR");
    return (
      <OptionCards
        label="Interview type"
        value={value}
        onChange={setValue}
        options={[
          { value: "HR", label: "HR" },
          { value: "Technical", label: "Technical" },
          { value: "Mixed", label: "Mixed" },
        ]}
      />
    );
  }

  it("is a keyboard-operable radio group", () => {
    render(<Harness />);
    const group = screen.getByRole("radiogroup", { name: "Interview type" });
    const radios = within(group).getAllByRole("radio");
    expect(radios[0].getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(radios[0], { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "Technical" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(screen.getByRole("radio", { name: "Technical" }), { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "Mixed" }).getAttribute("aria-checked")).toBe("true");
  });
});

describe("video preflight", () => {
  const base = {
    meta: [["Type", "Mixed"]] as Array<[string, string]>,
    resume: { needed: false, status: "ready" as const },
    detector: "ready" as const,
    canStart: false,
    starting: false,
    onRequestCamera: () => {},
    onRequestMic: () => {},
    onLoadDetector: () => {},
    onStart: () => {},
  };

  it("offers typing mode when camera permission is denied", () => {
    const onUseTyping = vi.fn();
    render(<PreflightScreen {...base} interactionMode="video" camera="denied" mic="granted" onUseTyping={onUseTyping} />);
    expect(screen.getByText(/Blocked or unavailable/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Start interview" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Use typing mode" }));
    expect(onUseTyping).toHaveBeenCalled();
  });

  it("does not ask for devices in typing mode", () => {
    render(<PreflightScreen {...base} interactionMode="typing" camera="unknown" mic="unknown" canStart onUseTyping={() => {}} />);
    expect(screen.queryByText("Camera")).toBeNull();
    expect((screen.getByRole("button", { name: "Start interview" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("interview setup", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, slots: [] })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("offers all three interview types and four difficulties", () => {
    render(<InterviewSetupClient />);
    const type = screen.getByRole("radiogroup", { name: "Interview type" });
    expect(within(type).getAllByRole("radio").map((r) => r.textContent)).toEqual([
      expect.stringContaining("HR"),
      expect.stringContaining("Technical"),
      expect.stringContaining("Mixed"),
    ]);
    expect(within(screen.getByRole("radiogroup", { name: "Difficulty" })).getAllByRole("radio")).toHaveLength(4);
  });

  it("shows inline validation instead of starting with a missing role or resume", () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", { value: { href: "", assign }, writable: true });
    render(<InterviewSetupClient />);
    fireEvent.change(screen.getByLabelText(/Job role/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("radio", { name: /Upload resume/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start interview" }));
    expect(screen.getByText("Enter the role you are preparing for.")).toBeTruthy();
    expect(screen.getByText(/Choose a resume file/)).toBeTruthy();
    expect(window.location.href).toBe("");
  });

  it("persists the chosen Mixed configuration for the live interview", async () => {
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
    render(<InterviewSetupClient />);
    fireEvent.click(screen.getByRole("radio", { name: /Mixed/ }));
    fireEvent.click(screen.getByRole("radio", { name: /^Hard/ }));
    fireEvent.change(screen.getByLabelText(/Job role/), { target: { value: "Platform Engineer" } });
    fireEvent.click(screen.getByRole("button", { name: "Start interview" }));
    await vi.waitFor(() => expect(window.location.href).toBe("/interview"));
    expect(JSON.parse(window.localStorage.getItem(DETAILS_KEY)!)).toMatchObject({ type: "Mixed", difficulty: "Hard", role: "Platform Engineer", useResume: false });
  });
});
