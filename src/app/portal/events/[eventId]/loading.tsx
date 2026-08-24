export default function EventTabLoading() {
  return (
    <div className="space-y-4">
      <div className="h-7 w-56 bg-surface-container-low rounded-lg animate-pulse" />
      <div className="h-40 bg-surface-container-low rounded-[20px] animate-pulse" />
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-surface-container-low rounded-[20px] animate-pulse" />
        ))}
      </div>
    </div>
  );
}
