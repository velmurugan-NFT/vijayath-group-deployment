export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <div className="brand-mark" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      V
    </div>
  );
}
