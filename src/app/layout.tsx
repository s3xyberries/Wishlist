import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { WishlistStoreProvider } from "@/lib/store";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-heading",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Pricekeep",
    template: "%s · Pricekeep",
  },
  description:
    "Search products, confirm the right match, and track prices across Amazon, eBay, and generic URLs.",
  applicationName: "Pricekeep",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Pricekeep",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <WishlistStoreProvider>
          <ServiceWorkerRegister />
          <AppShell>{children}</AppShell>
        </WishlistStoreProvider>
      </body>
    </html>
  );
}
