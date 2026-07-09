interface SkeletonLoaderProps {
  lines?: number;
}

export function SkeletonLoader({ lines = 3 }: SkeletonLoaderProps) {
  return (
    <div className="growth-skeleton-loader" aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}
