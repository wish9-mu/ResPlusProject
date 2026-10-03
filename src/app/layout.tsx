import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Call911Bar } from "@/components/call-911-bar";

export const metadata: Metadata = {
  title: "Res+ Emergency Coordination",
  description:
    "Res+ connects families, BHWs, ambulance crews, and ERs on one live record of the emergency.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#dc2626",
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom stays enabled for low-vision users. Inputs use 16px text so
  // iOS does not auto-zoom on focus. viewportFit enables safe-area insets.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))]">
        {children}
        {/* Safety rule #5: "Call 911" is always visible. */}
        <Call911Bar />
      </body>
    </html>
  );
}
