import NavigationHeader from "@/components/NavigationHeader";

export default function WebLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <NavigationHeader />
      <main className="container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
