// Shown immediately on navigation so switching pages responds at once
// instead of sitting on the old screen while the server query runs.
export default function Loading() {
  return (
    <>
      <div className="topbar">
        <div className="topbar-titlebar">
          <div>
            <div className="skeleton skeleton-title" />
            <div className="skeleton skeleton-sub" />
          </div>
        </div>
      </div>
      <main className="content">
        <div className="page">
          <div className="summary">
            {[0, 1, 2, 3].map((i) => (
              <div className="stat" key={i}>
                <div className="skeleton skeleton-stat" />
                <div className="skeleton skeleton-sub" />
              </div>
            ))}
          </div>
          <div className="skeleton skeleton-block" />
        </div>
      </main>
    </>
  );
}
