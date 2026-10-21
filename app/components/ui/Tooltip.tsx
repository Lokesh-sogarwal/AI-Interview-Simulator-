import { useId, type ReactElement, type ReactNode, cloneElement } from "react";

/**
 * Lightweight tooltip shown on hover and keyboard focus. The trigger is linked
 * with aria-describedby so screen readers announce the tip as well.
 */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactElement<{ "aria-describedby"?: string }> }) {
  const id = useId();
  return (
    <span className="group/tooltip relative inline-flex">
      {cloneElement(children, { "aria-describedby": id })}
      <span
        role="tooltip"
        id={id}
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-60 -translate-x-1/2 rounded-md bg-primary px-2.5 py-1.5 text-xs text-on-primary opacity-0 shadow-overlay transition-opacity group-focus-within/tooltip:opacity-100 group-hover/tooltip:opacity-100"
      >
        {content}
      </span>
    </span>
  );
}
