import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import ClientProviders from "@/components/layout/client-providers";
import { AuthProvider } from "@/components/auth/auth-provider";

const SpaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Axon",
  description: "Your day. Your goals. No stress. Let AI handle the mess.",
  icons: {
    icon: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${SpaceGrotesk.variable} ${GeistMono.variable} font-sans antialiased`}
      >
        <ClientProviders>
          <AuthProvider>{children}</AuthProvider>
          <Toaster />
        </ClientProviders>
      </body>
    </html>
  );
}
