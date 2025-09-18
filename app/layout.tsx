import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SWRProvider } from "@/components/providers/swr-provider";
import "@/lib/startup"; // Initialize app services

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Konkurser i Norge",
  description: "Overvåking av konkurser og adresseendringer i norske bedrifter",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nb">
      <body className={inter.className}>
        <SWRProvider>
          <main className="min-h-screen bg-background">{children}</main>
        </SWRProvider>
      </body>
    </html>
  );
}
