import { Minus, Plus } from './Icons';

interface Props {
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  size?: 'sm' | 'lg';
  labels?: { dec: string; inc: string };
}

export function Stepper({ value, min = 0, max = 99, onChange, size = 'sm', labels = { dec: '−', inc: '+' } }: Props) {
  return (
    <div className={`stepper stepper--${size}`}>
      <button type="button" aria-label={labels.dec} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        <Minus />
      </button>
      <span aria-live="polite">{value}</span>
      <button type="button" aria-label={labels.inc} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        <Plus />
      </button>
    </div>
  );
}
