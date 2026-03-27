import React from "react";

export default function InterviewScreen(props: {
  interactionMode: "typing" | "video";
  video: React.ReactNode;
  typing: React.ReactNode;
}) {
  return props.interactionMode === "video" ? props.video : props.typing;
}
