import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { AppProviders } from "@/components/shell/providers";

export const metadata: Metadata = {
  title: { default: "Life OS", template: "%s · Life OS" },
  description: "A personal command center for money, nutrition and productivity.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F3EE" },
    { media: "(prefers-color-scheme: dark)", color: "#0F0F11" },
  ],
};

// Applies the saved theme before first paint to avoid a light/dark flash.
const themeScript = `(function(){try{var t=localStorage.getItem("life-os:theme")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
