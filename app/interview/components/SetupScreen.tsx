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
  const getStatusIcon = (status: "granted" | "denied" | "unknown" | "ready" | "loading" | "error" | "idle") => {
    switch (status) {
      case "granted":
      case "ready":
        return "✓";
      case "loading":
        return "⏳";
      case "denied":
      case "error":
        return "✕";
      default:
        return "○";
    }
  };

  const getStatusColor = (status: "granted" | "denied" | "unknown" | "ready" | "loading" | "error" | "idle") => {
    switch (status) {
      case "granted":
      case "ready":
        return "text-green-600";
      case "loading":
        return "text-blue-600";
      case "denied":
      case "error":
        return "text-red-600";
      default:
        return "text-foreground/50";
    }
  };

  return (
    <section className="mx-auto grid max-w-3xl gap-6 py-8">
      {props.readyToStart ? (
        <div className="rounded-xl border border-foreground/10 bg-gradient-to-br from-green-500/5 to-emerald-500/5 p-8 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-green-600 text-white text-2xl">
            ✓
          </div>
          <h1 className="mt-4 text-balance text-2xl font-semibold tracking-tight">Ready to Start</h1>
          <p className="mt-2 text-pretty text-sm leading-6 text-foreground/70">{props.scheduleMessage}</p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={props.onStartInterview}
              disabled={!props.canStartNow}
              className="inline-flex h-12 flex-1 items-center justify-center rounded-lg bg-green-600 px-6 text-sm font-semibold text-white transition-all enabled:hover:bg-green-700 disabled:opacity-60"
            >
              🎤 Begin Interview
            </button>
            <button
              type="button"
              onClick={props.onBack}
              className="inline-flex h-12 flex-1 items-center justify-center rounded-lg border border-foreground/15 px-6 text-sm font-medium transition-all hover:bg-foreground/5"
            >
              Back to Dashboard
            </button>
          </div>

          <div className="mt-4 text-sm text-foreground/70" aria-live="polite">
            {props.message || (props.startRequested ? "Starting…" : "")}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Setup Header */}
          <div className="rounded-xl border border-foreground/10 bg-gradient-to-br from-blue-500/5 to-purple-500/5 p-6">
            <h1 className="text-2xl font-bold text-foreground">Pre-Interview Setup</h1>
            <p className="mt-2 text-sm text-foreground/70">
              Complete the following checklist to prepare your environment. {props.interactionMode === "video" ? "Camera and microphone access required." : "No camera/mic needed for typing mode."}
            </p>
          </div>

          {/* Setup Checklist */}
          <div className="space-y-3">
            {/* Resume Context */}
            <div className="rounded-lg border border-foreground/10 bg-background p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <span className={`text-lg font-semibold ${getStatusColor(props.needsResume ? "granted" : "granted")}`}>
                    📄
                  </span>
                  <div>
                    <div className="font-medium text-foreground">Resume Context</div>
                    <div className="text-sm text-foreground/70 mt-1">{props.resumeStatusText}</div>
                  </div>
                </div>
                <span className={`text-2xl font-bold ${getStatusColor(props.needsResume ? "granted" : "granted")}`}>
                  {getStatusIcon("granted")}
                </span>
              </div>
            </div>

            {/* Video Mode Checks */}
            {props.interactionMode === "video" ? (
              <>
                {/* Camera Permission */}
                <div className="rounded-lg border border-foreground/10 bg-background p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <span className="text-lg font-semibold">📷</span>
                      <div>
                        <div className="font-medium text-foreground">Camera Permission</div>
                        <div className="text-sm text-foreground/70 mt-1">
                          {props.cameraPermission === "granted"
                            ? "Camera access granted"
                            : props.cameraPermission === "denied"
                              ? "Camera access denied"
                              : "Camera permission pending"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-2xl font-bold ${getStatusColor(props.cameraPermission)}`}>
                        {getStatusIcon(props.cameraPermission)}
                      </span>
                      <button
                        type="button"
                        onClick={props.onRequestCamera}
                        disabled={props.cameraPermission === "granted"}
                        className="inline-flex h-10 items-center justify-center rounded-lg border border-foreground/15 px-4 text-sm font-medium transition-all enabled:hover:bg-foreground/5 disabled:opacity-60"
                      >
                        {props.cameraPermission === "granted" ? "✓ Ready" : "Allow"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Microphone Permission */}
                <div className="rounded-lg border border-foreground/10 bg-background p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <span className="text-lg font-semibold">🎙️</span>
                      <div>
                        <div className="font-medium text-foreground">Microphone Permission</div>
                        <div className="text-sm text-foreground/70 mt-1">
                          {props.micPermission === "granted"
                            ? "Microphone access granted"
                            : props.micPermission === "denied"
                              ? "Microphone access denied"
                              : "Microphone permission pending"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-2xl font-bold ${getStatusColor(props.micPermission)}`}>
                        {getStatusIcon(props.micPermission)}
                      </span>
                      <button
                        type="button"
                        onClick={props.onRequestMic}
                        disabled={props.micPermission === "granted"}
                        className="inline-flex h-10 items-center justify-center rounded-lg border border-foreground/15 px-4 text-sm font-medium transition-all enabled:hover:bg-foreground/5 disabled:opacity-60"
                      >
                        {props.micPermission === "granted" ? "✓ Ready" : "Allow"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Face Detection */}
                <div className="rounded-lg border border-foreground/10 bg-background p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <span className="text-lg font-semibold">👁️</span>
                      <div>
                        <div className="font-medium text-foreground">Face Detection</div>
                        <div className="text-sm text-foreground/70 mt-1">
                          {props.faceDetectionStatus === "ready"
                            ? "Face detection ready"
                            : props.faceDetectionStatus === "loading"
                              ? "Loading face detection…"
                              : props.faceDetectionStatus === "error"
                                ? "Face detection unavailable"
                                : "Load face detection"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-2xl font-bold ${getStatusColor(props.faceDetectionStatus)}`}>
                        {getStatusIcon(props.faceDetectionStatus)}
                      </span>
                      <button
                        type="button"
                        onClick={props.onLoadFaceDetection}
                        disabled={props.faceDetectionStatus === "ready" || props.faceDetectionStatus === "loading"}
                        className="inline-flex h-10 items-center justify-center rounded-lg border border-foreground/15 px-4 text-sm font-medium transition-all enabled:hover:bg-foreground/5 disabled:opacity-60"
                      >
                        {props.faceDetectionStatus === "ready"
                          ? "✓ Ready"
                          : props.faceDetectionStatus === "loading"
                            ? "Loading…"
                            : "Load"}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-foreground/10 bg-background p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <span className="text-lg font-semibold">⌨️</span>
                    <div>
                      <div className="font-medium text-foreground">Typing Practice Mode</div>
                      <div className="text-sm text-foreground/70 mt-1">No camera or microphone required</div>
                    </div>
                  </div>
                  <span className="text-2xl font-bold text-green-600">✓</span>
                </div>
              </div>
            )}
          </div>

          {/* Status Message */}
          {props.message && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
              <p className="text-sm text-foreground/80">{props.message}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
