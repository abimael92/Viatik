import type { Metadata } from "next";
import LayoutProps from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { RecoveryLinkCatcher } from "@/components/auth/recovery-link-catcher";
import { ErrorBoundary } from "@/components/error-boundary";
import { ThemeInitScript } from "@/components/theme-initializer";
import { I18nProvider } from "@/lib/i18n/i18n-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Viatik — Offline-First Travel Itineraries",
  description: "Plan trips with friends, even offline. Viatik syncs your itinerary, expenses, and gallery whenever you are back online.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <ThemeInitScript />
      </head>
      <body className="min-h-full flex flex-col">
        <I18nProvider>
          <RecoveryLinkCatcher />
          <ErrorBoundary>{children}</ErrorBoundary>
        </I18nProvider>
      </body>
    </html>
  );
}
