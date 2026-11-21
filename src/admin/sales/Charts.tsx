import { useState } from 'react';
import { won } from '../../lib/menu';

/**
 * 단일 시리즈 세로 막대 (주문 수 / 매출).
 * 막대 24px 이하, 위쪽 4px 둥근 끝, 기준선은 평평, 마우스를 올리면 툴팁.
 */
export function ColumnChart({
  data,
  label,
  valueOf,
  format,
  tooltip,
}: {
  data: { key: string; label: string }[];
  label: string;
  valueOf: (i: number) => number;
  format: (v: number) => string;
  tooltip: (i: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const values = data.map((_, i) => valueOf(i));
  const max = Math.max(1, ...values);
  const nice = niceMax(max);
  const ticks = [0, nice / 2, nice];
  const maxIdx = values.indexOf(Math.max(...values));
  const H = 160;

  return (
    <figure className="cchart" aria-label={label}>
      <div className="cchart-plot">
        <div className="cchart-ticks" aria-hidden="true">
          {[...ticks].reverse().map((t) => <span key={t}>{format(t)}</span>)}
        </div>
        <div className="cchart-area" style={{ height: H }}>
          {ticks.map((t) => <span key={t} className="cchart-grid" style={{ bottom: `${(t / nice) * 100}%` }} />)}
          <div className="cchart-cols">
            {data.map((d, i) => {
              const v = values[i];
              const h = v > 0 ? Math.max(3, (v / nice) * H) : 0;
              return (
                <div
                  key={d.key}
                  className={`cchart-col${hover === i ? ' is-hover' : ''}`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                  aria-label={tooltip(i)}
                >
                  {i === maxIdx && v > 0 && <span className="cchart-cap" style={{ bottom: h + 4 }}>{format(v)}</span>}
                  <span className="cchart-bar" style={{ height: h }} />
                  {hover === i && <span className="cchart-tip" role="tooltip" style={{ bottom: h + 10 }}>{tooltip(i)}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="cchart-x" aria-hidden="true">
        <span className="cchart-x-pad" />
        <div className="cchart-x-labels">
          {data.map((d, i) => <span key={d.key} className={data.length > 16 && i % 2 ? 'hide-sm' : ''}>{d.label}</span>)}
        </div>
      </div>
    </figure>
  );
}

function niceMax(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * p;
}

export const compactWon = (v: number) => (v >= 10000 ? `${(v / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}만` : won(v));
