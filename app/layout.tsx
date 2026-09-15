import type { Metadata } from "next";
import LayoutProps from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ErrorBoundary } from "@/components/error-boundary";

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

// Apply the persisted theme before first paint to avoid a flash; falls back to
// the OS preference (CSS handles prefers-color-scheme when no choice is saved).
const themeInitScript = `(function(){try{var s=localStorage.getItem("viatik-theme");var r=document.documentElement;if(s==="dark"||s==="light"){r.setAttribute("data-theme",s);}else{r.removeAttribute("data-theme");}}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme init script sets `data-theme` on <html> before React hydrates,
    // so suppress hydration warnings on this element to avoid a false mismatch.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
