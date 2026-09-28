export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Every route under here is behind the proxy's auth check, so anything
  // rendered in this subtree can assume there is a signed-in user.
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">{children}</div>
  );
}
