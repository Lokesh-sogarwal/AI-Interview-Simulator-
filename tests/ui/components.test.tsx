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
import { CompletionView } from "@/app/interview/components/LiveParts";
import { CallControls, VideoLobby } from "@/app/interview/components/VideoCall";
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

  it("opens settings saved by the old typing mode as a video interview", () => {
    expect(parseDetails(JSON.stringify({ type: "HR", interactionMode: "typing" }))?.interactionMode).toBe("video");
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

describe("video lobby", () => {
  const base = {
    meta: [["Type", "Mixed"]] as Array<[string, string]>,
    stream: null,
    version: 0,
    micLevel: 0,
    engine: "browser" as const,
    detector: "idle" as const,
    canStart: false,
    starting: false,
    onRequestDevices: () => {},
    onLoadDetector: () => {},
    onStart: () => {},
    consent: true,
    onConsentChange: () => {},
    fullscreenSupported: true,
  };

  it("discloses proctoring before anything starts and asks for agreement", () => {
    const onConsentChange = vi.fn();
    render(<VideoLobby {...base} camera="unknown" mic="unknown" consent={false} onConsentChange={onConsentChange} />);
    expect(screen.getByText("Proctoring and privacy")).toBeTruthy();
    expect(screen.getByText(/Video and audio are never recorded or stored/)).toBeTruthy();
    expect(screen.getByText(/deleted automatically after 180 days/)).toBeTruthy();
    expect(screen.getByText(/never end the interview, change your scores, or prove misconduct/)).toBeTruthy();
    expect(screen.getByText(/exiting fullscreen/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/agree to proctoring/));
    expect(onConsentChange).toHaveBeenCalledWith(true);
  });

  it("doesn't mention fullscreen where the browser can't do it", () => {
    render(<VideoLobby {...base} camera="unknown" mic="unknown" fullscreenSupported={false} />);
    expect(screen.queryByText(/exiting fullscreen/)).toBeNull();
  });

  it("asks for camera and microphone before the interview can start", () => {
    const onRequestDevices = vi.fn();
    render(<VideoLobby {...base} camera="unknown" mic="unknown" onRequestDevices={onRequestDevices} />);
    expect((screen.getByRole("button", { name: "Start interview" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Allow camera and microphone" }));
    expect(onRequestDevices).toHaveBeenCalledOnce();
    expect(screen.getByText(/Video and audio are never recorded/)).toBeTruthy();
  });

  it("explains a blocked microphone and offers to try again", () => {
    render(<VideoLobby {...base} camera="granted" mic="denied" />);
    expect(screen.getByText(/Blocked\. Allow it in your browser/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try camera and microphone again" })).toBeTruthy();
  });

  it("lets the candidate continue with audio only when there is no camera", () => {
    render(<VideoLobby {...base} camera="unavailable" mic="granted" canStart />);
    expect(screen.getByText(/You can still interview with audio only/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Start interview" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it.each([
    ["browser", /Live captions in this browser/],
    ["server", /Transcribed after each answer/],
    ["none", /can't capture speech/],
  ] as const)("describes the %s speech-to-text path", (engine, text) => {
    render(<VideoLobby {...base} engine={engine} camera="granted" mic="granted" />);
    expect(screen.getByText(text)).toBeTruthy();
  });

  it("offers no typing mode", () => {
    render(<VideoLobby {...base} camera="denied" mic="denied" />);
    expect(screen.queryByText(/typing/i)).toBeNull();
  });
});

describe("call controls", () => {
  it("toggles the microphone and camera and ends the call", () => {
    const onToggleMic = vi.fn();
    const onToggleCamera = vi.fn();
    const onEnd = vi.fn();
    render(<CallControls micOn cameraOn={false} onToggleMic={onToggleMic} onToggleCamera={onToggleCamera} onEnd={onEnd} />);
    const mic = screen.getByRole("button", { name: "Mute microphone" });
    expect(mic.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(mic);
    fireEvent.click(screen.getByRole("button", { name: "Turn camera on" }));
    fireEvent.click(screen.getByRole("button", { name: "End interview" }));
    expect([onToggleMic, onToggleCamera, onEnd].every((f) => f.mock.calls.length === 1)).toBe(true);
  });
});

describe("interview setup", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, slots: [] })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("offers only the video interview, with no typing option", () => {
    render(<InterviewSetupClient />);
    expect(screen.getAllByText("Video interview").length).toBeGreaterThan(0);
    expect(screen.queryByText("Typing")).toBeNull();
    expect(screen.queryByText(/Type your answers/)).toBeNull();
  });

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

describe("interview completion", () => {
  const base = { averageScore: 6.5, report: null, endedReason: "manual_end", saved: true, interviewId: "x" };

  it("explains that there is nothing to evaluate when no answers were given", () => {
    render(<CompletionView {...base} averageScore={null} answered={0} reportError="No answers were recorded in this interview, so there is nothing to evaluate." />);
    expect(screen.getByText("Nothing to evaluate")).toBeTruthy();
    expect(screen.queryByText("AI report unavailable")).toBeNull();
  });

  it("shows the server's error and offers a retry for recoverable report failures", () => {
    const onRetryReport = vi.fn();
    render(<CompletionView {...base} answered={3} reportError="Report generation is temporarily unavailable." reportRetryable onRetryReport={onRetryReport} />);
    expect(screen.getByText(/Report generation is temporarily unavailable\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetryReport).toHaveBeenCalledOnce();
  });

  it("does not offer a retry for permanent failures", () => {
    render(<CompletionView {...base} answered={3} reportError="Finish the interview before generating its report." reportRetryable={false} onRetryReport={() => {}} />);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});
