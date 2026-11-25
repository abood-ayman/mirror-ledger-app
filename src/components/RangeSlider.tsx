import type { Language } from '../types/tracker';

interface RangeSliderProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
  color: string; // #00B8A9 for Energy, #8B5CF6 for Focus
  lang: Language;
  min?: number;
  max?: number;
}

export function RangeSlider({
  label,
  value,
  onChange,
  color,
  lang,
  min = 1,
  max = 10,
}: RangeSliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const gradientDir = lang === 'ar' ? 'to left' : 'to right';

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-sm font-bold">
        <span className="text-white">{label}</span>
        <span
          className="px-2.5 py-0.5 rounded-full text-xs font-extrabold tabular-nums"
          style={{ backgroundColor: `${color}22`, color }}
        >
          {value}/10
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        dir={dir}
        onChange={(e) => onChange(Number(e.target.value))}
        className="ml-slider w-full"
        style={{
          background: `linear-gradient(${gradientDir}, ${color} 0%, ${color} ${pct}%, #2A2A2A ${pct}%, #2A2A2A 100%)`,
        }}
        aria-label={label}
      />
    </div>
  );
}
