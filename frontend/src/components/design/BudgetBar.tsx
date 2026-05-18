export function BudgetBar({ est, committed, paid }: { est: number; committed: number; paid: number }) {
  if (!est) return <div className="bar"><span style={{ width: '0%' }} /></div>;
  const cp = Math.min(100, (committed / est) * 100);
  const pp = Math.min(100, (paid / est) * 100);
  const over = committed + paid > est;
  return (
    <div className={`bar ${over ? 'over' : ''}`}>
      <span className="committed" style={{ width: `${cp}%` }} />
      <span className="paid" style={{ width: `${pp}%` }} />
    </div>
  );
}
