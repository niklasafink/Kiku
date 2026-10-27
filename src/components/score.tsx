import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { Attempt } from "@/lib/types";

export function scoreTone(score: number): "success" | "warning" | "error" {
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  return "error";
}

const BADGE = {
  success: "badge-success",
  warning: "badge-warning",
  error: "badge-error",
} as const;

export function ScoreBadge({ score }: { score: number }) {
  return <span className={`badge badge-soft badge-sm font-bold tabular-nums ${BADGE[scoreTone(score)]}`}>{score} %</span>;
}

export function Trend({ delta }: { delta: number }) {
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-bold text-success">
        <TrendingUp className="size-4" aria-hidden />+{delta} Pkt.
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-bold text-error">
        <TrendingDown className="size-4" aria-hidden />
        {delta} Pkt.
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm font-bold opacity-60">
      <Minus className="size-4" aria-hidden />0 Pkt.
    </span>
  );
}

/**
 * Score over time as a small line chart that stretches to the full width.
 * Attempts must be sorted oldest first.
 */
export function ScoreChart({ attempts }: { attempts: Attempt[] }) {
  // Positions in percent of the plot area; dots are HTML so they stay round when the line stretches.
  const x = (i: number) => (attempts.length === 1 ? 50 : (i * 100) / (attempts.length - 1));
  const y = (score: number) => 100 - score;

  return (
    <div
      className="relative mx-2 my-2 h-20"
      role="img"
      aria-label={`Verlauf der Ergebnisse: ${attempts.map((a) => `${a.score} %`).join(", ")}`}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
        {[0, 50, 100].map((v) => (
          <line
            key={v}
            x1={0}
            x2={100}
            y1={y(v)}
            y2={y(v)}
            className="stroke-base-300"
            strokeWidth={1.5}
            strokeDasharray="3 5"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {attempts.length > 1 && (
          <polyline
            points={attempts.map((a, i) => `${x(i)},${y(a.score)}`).join(" ")}
            fill="none"
            className="stroke-primary"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {attempts.map((a, i) => (
        <span
          key={a.id}
          title={`${a.score} %`}
          className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-primary bg-base-100"
          style={{ left: `${x(i)}%`, top: `${y(a.score)}%` }}
        />
      ))}
    </div>
  );
}
