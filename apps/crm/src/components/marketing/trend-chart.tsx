import { periodLabel } from "./format";

// Columns of leads per day or month: one ink color, a hairline baseline, the peak labeled on its
// cap (never every column), axis labels at the start, middle and end, and a native tooltip per
// column. The table below the chart carries every value.

export type Point = { key: string; value: number };

const HEIGHT = 160;
const TOP = 20; // room for the peak's label
const AXIS = 24; // room for the date labels

export function TrendChart({ title, points }: { title: string; points: Point[] }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const peak = points.reduce<Point | null>(
    (best, p) => (!best || p.value > best.value ? p : best),
    null,
  );
  const slot = 100 / Math.max(1, points.length);
  const plot = HEIGHT - TOP - AXIS;
  const ticks = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]);
  const total = points.reduce((sum, p) => sum + p.value, 0);
  return (
    <svg
      role="img"
      aria-label={`${title}: ${total} leads en ${points.length} periodos; máximo ${peak?.value ?? 0} el ${peak ? periodLabel(peak.key) : ""}.`}
      width="100%"
      height={HEIGHT}
      className="block overflow-visible text-xs"
    >
      <line
        x1="0"
        x2="100%"
        y1={TOP + plot}
        y2={TOP + plot}
        className="stroke-border"
        strokeWidth={1}
      />
      {points.map((point, index) => {
        const h = (point.value / max) * plot;
        const x = index * slot + slot * 0.2;
        const isPeak = peak?.key === point.key && point.value > 0;
        return (
          <g key={point.key}>
            <title>{`${periodLabel(point.key)}: ${point.value} leads`}</title>
            {/* Invisible full-height hit area, larger than the column, for the tooltip. */}
            <rect
              x={`${index * slot}%`}
              y={TOP}
              width={`${slot}%`}
              height={plot}
              className="fill-transparent"
            />
            {point.value > 0 ? (
              <rect
                x={`${x}%`}
                y={TOP + plot - h}
                width={`${slot * 0.6}%`}
                height={h}
                rx={Math.min(4, h / 2)}
                className="fill-primary"
              />
            ) : null}
            {isPeak ? (
              <text
                x={`${x + slot * 0.3}%`}
                y={TOP + plot - h - 6}
                textAnchor="middle"
                className="fill-fg font-medium tabular-nums"
              >
                {point.value}
              </text>
            ) : null}
            {ticks.has(index) ? (
              <text
                x={`${x + slot * 0.3}%`}
                y={HEIGHT - 6}
                textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
                className="fill-fg-muted"
              >
                {periodLabel(point.key)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
