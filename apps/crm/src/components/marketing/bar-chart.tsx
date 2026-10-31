// Horizontal bars, one series (platforms, funnel stages): one ink color for every bar, the value
// at the bar's tip, a hairline baseline and a native tooltip per bar. Percent coordinates keep
// it fluid without scaling the text. Identity is the row label, so there is no legend; the table
// next to it is the accessible equivalent.

export type Bar = { key: string; label: string; value: number; display: string; note?: string };

const ROW = 36;
const BAR = 16;
const LABEL_WIDTH = 34; // % of the width for the row labels
const TRACK = 46; // % of the width the longest bar takes; the rest is room for its value

export function BarChart({ title, bars }: { title: string; bars: Bar[] }) {
  const max = Math.max(1, ...bars.map((bar) => bar.value));
  const height = bars.length * ROW;
  const summary = bars.map((bar) => `${bar.label}: ${bar.display}`).join("; ");
  return (
    <svg
      role="img"
      aria-label={`${title}. ${summary}`}
      width="100%"
      height={height}
      className="block overflow-visible text-sm"
    >
      <line
        x1={`${LABEL_WIDTH}%`}
        x2={`${LABEL_WIDTH}%`}
        y1={0}
        y2={height}
        className="stroke-border"
        strokeWidth={1}
      />
      {bars.map((bar, index) => {
        const y = index * ROW + (ROW - BAR) / 2;
        const width = (bar.value / max) * TRACK;
        const end = LABEL_WIDTH + width;
        return (
          <g key={bar.key}>
            <title>{`${bar.label}: ${bar.display}${bar.note ? ` (${bar.note})` : ""}`}</title>
            <text x={0} y={y + BAR / 2} dominantBaseline="central" className="fill-fg">
              {bar.label}
            </text>
            {bar.value > 0 ? (
              // Square at the baseline, 4px round at the data end: a rect plus a rounded cap.
              <>
                <rect
                  x={`${LABEL_WIDTH}%`}
                  y={y}
                  width={`${width}%`}
                  height={BAR}
                  rx={4}
                  className="fill-primary"
                />
                {width >= 3 ? (
                  <rect
                    x={`${LABEL_WIDTH}%`}
                    y={y}
                    width={8}
                    height={BAR}
                    className="fill-primary"
                  />
                ) : null}
              </>
            ) : null}
            <text
              x={`${end}%`}
              dx={8}
              y={y + BAR / 2}
              dominantBaseline="central"
              className="fill-fg font-medium tabular-nums"
            >
              {bar.display}
              {bar.note ? <tspan className="fill-fg-muted font-normal"> · {bar.note}</tspan> : null}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
