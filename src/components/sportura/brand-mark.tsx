export function BrandMark({
  className = "",
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <img
      src="/icons/sportura-mark-128.png"
      className={`sportura-brand-mark ${className}`.trim()}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
    />
  );
}
