import Link from "next/link";

export default function WebLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <nav className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <Link href="/kommuner" className="text-xl font-bold text-gray-900">
              Konkurser i Norge
            </Link>
            <div className="flex gap-4">
              <Link href="/admin" className="text-gray-600 hover:text-gray-900">
                Admin
              </Link>
              <Link
                href="/studio"
                className="text-gray-600 hover:text-gray-900"
              >
                Studio
              </Link>
            </div>
          </div>
        </nav>
      </header>
      {children}
    </div>
  );
}
