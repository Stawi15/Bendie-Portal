export default function PortalLoading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-48 bg-surface-container-low rounded-lg animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-28 bg-surface-container-low rounded-[20px] animate-pulse" />
        ))}
      </div>
    </div>
  );
}
