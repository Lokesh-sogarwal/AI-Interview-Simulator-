export type FaceBox = { x: number; y: number; width: number; height: number };

export type FaceDetectorApi = {
  detect: (video: HTMLVideoElement) => Promise<FaceBox[]>;
  dispose?: () => void;
};

type NativeDetectedFace = { boundingBox: DOMRectReadOnly };

type NativeFaceDetectorInstance = {
  detect: (input: HTMLVideoElement) => Promise<NativeDetectedFace[]>;
};

type NativeFaceDetectorCtor = new (options?: {
  fastMode?: boolean;
  maxDetectedFaces?: number;
}) => NativeFaceDetectorInstance;

function getNativeFaceDetectorCtor(): NativeFaceDetectorCtor | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return (w.FaceDetector as NativeFaceDetectorCtor | undefined) ?? null;
}

export async function createFaceDetector(): Promise<FaceDetectorApi | null> {
  if (typeof window === "undefined") return null;

  // 1) Prefer native API if available.
  const NativeCtor = getNativeFaceDetectorCtor();
  if (NativeCtor) {
    try {
      const native = new NativeCtor({ fastMode: true, maxDetectedFaces: 3 });
      return {
        detect: async (video) => {
          const faces = await native.detect(video);
          return faces.map((f) => ({
            x: f.boundingBox.x,
            y: f.boundingBox.y,
            width: f.boundingBox.width,
            height: f.boundingBox.height,
          }));
        },
      };
    } catch {
      // Fall through to model-based detector.
    }
  }

  // 2) Cross-browser fallback: MediaPipe Tasks Vision (WASM + BlazeFace).
  try {
    const tasks = await import("@mediapipe/tasks-vision");

    const vision = await tasks.FilesetResolver.forVisionTasks(
      "/mediapipe/wasm",
    );

    const detector = await tasks.FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "/api/mediapipe/model",
      },
      runningMode: "VIDEO",
      minDetectionConfidence: 0.5,
    });

    return {
      detect: async (video) => {
        // MediaPipe expects a monotonically increasing timestamp in ms.
        const ts = performance.now();
        const result = detector.detectForVideo(video, ts);
        const detections = result?.detections ?? [];
        const boxes = detections
          .map((d) => {
            const bb = d.boundingBox;
            if (!bb) return null;
            return {
              x: bb.originX ?? 0,
              y: bb.originY ?? 0,
              width: bb.width ?? 0,
              height: bb.height ?? 0,
            } satisfies FaceBox;
          })
          .filter((b): b is FaceBox => b !== null)
          .filter((b) => b.width > 0 && b.height > 0);

        return boxes;
      },
      dispose: () => {
        try {
          detector.close();
        } catch {
          // ignore
        }
      },
    };
  } catch {
    return null;
  }
}
