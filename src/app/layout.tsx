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
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen pb-16">
        {children}
        {/* Safety rule #5: "Call 911" is always visible. */}
        <Call911Bar />
      </body>
    </html>
  );
}
