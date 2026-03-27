import React from "react";

export default function SetupScreen(props: {
  readyToStart: boolean;
  canStartNow: boolean;
  scheduleMessage: string;
  message: string;
  startRequested: boolean;
  interactionMode: "typing" | "video";
  needsResume: boolean;
  resumeStatusText: string;
  cameraPermission: "unknown" | "granted" | "denied";
  micPermission: "unknown" | "granted" | "denied";
  faceDetectionStatus: "idle" | "loading" | "ready" | "error";
  onStartInterview: () => void;
  onBack: () => void;
  onRequestCamera: () => void;
  onRequestMic: () => void;
  onLoadFaceDetection: () => void;
}) {
  return (
    <section className="mx-auto grid max-w-3xl gap-6 py-8">
      {props.readyToStart ? (
        <div className="rounded-3xl border border-foreground/10 bg-background p-8 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-foreground text-background">
            <span className="text-base font-semibold">AI</span>
          </div>
          <h1 className="mt-4 text-balance text-2xl font-semibold tracking-tight">Ready to start</h1>
          <p className="mt-2 text-pretty text-sm leading-6 text-foreground/70">{props.scheduleMessage}</p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={props.onStartInterview}
              disabled={!props.canStartNow}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity enabled:hover:opacity-90 disabled:opacity-60"
            >
              Start Interview
            </button>
            <button
              type="button"
              onClick={props.onBack}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-foreground/15 px-5 text-sm font-medium transition-opacity hover:opacity-90"
            >
              Back to dashboard
            </button>
          </div>

          <div className="mt-4 text-sm text-foreground/70" aria-live="polite">
            {props.message || (props.startRequested ? "Starting…" : "")}
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-foreground/10 bg-background p-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Setup</h1>
            <p className="text-sm leading-6 text-foreground/70">
              Allow camera/mic and load face detection. When everything is ready, you’ll see a Start button.
            </p>
          </div>

          <div className="mt-5 grid gap-3">
            <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
              <div className="text-sm font-medium">Load resume context</div>
              <div className="mt-1 text-sm text-foreground/70">{props.resumeStatusText}</div>
            </div>

            {props.interactionMode === "video" ? (
              <>
                <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">Camera permission</div>
                      <div className="mt-1 text-sm text-foreground/70">
                        {props.cameraPermission === "granted"
                          ? "Granted"
                          : props.cameraPermission === "denied"
                            ? "Denied"
                            : "Not granted yet"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={props.onRequestCamera}
                      disabled={props.cameraPermission === "granted"}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-foreground/15 px-4 text-sm font-medium transition-opacity enabled:hover:opacity-90 disabled:opacity-60"
                    >
                      {props.cameraPermission === "granted" ? "Ready" : "Allow"}
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">Microphone permission</div>
                      <div className="mt-1 text-sm text-foreground/70">
                        {props.micPermission === "granted"
                          ? "Granted"
                          : props.micPermission === "denied"
                            ? "Denied"
                            : "Not granted yet"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={props.onRequestMic}
                      disabled={props.micPermission === "granted"}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-foreground/15 px-4 text-sm font-medium transition-opacity enabled:hover:opacity-90 disabled:opacity-60"
                    >
                      {props.micPermission === "granted" ? "Ready" : "Allow"}
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">Face detection</div>
                      <div className="mt-1 text-sm text-foreground/70">
                        {props.faceDetectionStatus === "ready"
                          ? "Ready"
                          : props.faceDetectionStatus === "loading"
                            ? "Loading…"
                            : props.faceDetectionStatus === "error"
                              ? "Unavailable"
                              : "Not loaded"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={props.onLoadFaceDetection}
                      disabled={props.faceDetectionStatus === "ready" || props.faceDetectionStatus === "loading"}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-foreground/15 px-4 text-sm font-medium transition-opacity enabled:hover:opacity-90 disabled:opacity-60"
                    >
                      {props.faceDetectionStatus === "ready"
                        ? "Ready"
                        : props.faceDetectionStatus === "loading"
                          ? "Loading…"
                          : "Load"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4">
                <div className="text-sm font-medium">Typing practice</div>
                <div className="mt-1 text-sm text-foreground/70">No camera/mic needed.</div>
              </div>
            )}
          </div>

          <div className="mt-4 text-sm text-foreground/70" aria-live="polite">
            {props.message}
          </div>
        </div>
      )}
    </section>
  );
}
