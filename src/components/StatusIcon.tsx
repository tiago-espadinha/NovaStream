export type StatusTone = "success" | "warning" | "error";

const paths: Record<StatusTone, string> = {
  success: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8.5 12.5l2.5 2.5 4.5-5",
  warning: "M12 4L2.5 20h19L12 4zM12 10v4.5M12 17.5v.01",
  error: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 9l6 6M15 9l-6 6",
};

/** A status mark drawn in the current text color; decorative, since the message text says the same. */
export function StatusIcon({ tone }: { tone: StatusTone }) {
  return (
    <svg className="status-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[tone]} />
    </svg>
  );
}
