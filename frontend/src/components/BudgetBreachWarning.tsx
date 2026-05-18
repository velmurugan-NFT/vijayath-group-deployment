import { AlertTriangle } from 'lucide-react';

export function BudgetBreachWarning({
  lines,
  checked,
  onCheckedChange,
}: {
  lines: { description: string; breach: boolean }[];
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  const breachLines = lines.filter((l) => l.breach);
  if (breachLines.length === 0) return null;
  return (
    <div className="breach-warn">
      <AlertTriangle className="w-[18px] h-[18px] text-vijayanth-danger shrink-0 mt-0.5" />
      <div className="flex-1">
        <div className="t">Budget breach detected</div>
        <div className="d">
          {breachLines.map((b, i) => (
            <span key={i}>{b.description}{i < breachLines.length - 1 ? ' · ' : ''}</span>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-1.5 text-xs whitespace-nowrap shrink-0 cursor-pointer">
        <input type="checkbox" checked={checked} onChange={(e) => onCheckedChange(e.target.checked)} />
        I acknowledge
      </label>
    </div>
  );
}
