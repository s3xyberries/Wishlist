import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { RegionProvider } from "@/lib/region/context";
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

/** Runs before React — on loopback, nuke ALL service workers + caches (Firefox NetworkError). */
const LOOPBACK_SW_CLEAR = `
(function(){
  try {
    var h = location.hostname;
    if (h !== "127.0.0.1" && h !== "localhost" && h !== "[::1]" && h !== "::1") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.getRegistrations().then(function(rs){
      rs.forEach(function(r){ r.unregister(); });
    });
    if ("caches" in window) {
      caches.keys().then(function(keys){
        keys.forEach(function(k){ caches.delete(k); });
      });
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${fraunces.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: LOOPBACK_SW_CLEAR }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <WishlistStoreProvider>
          <RegionProvider>
            <ServiceWorkerRegister />
            <AppShell>{children}</AppShell>
          </RegionProvider>
        </WishlistStoreProvider>
      </body>
    </html>
  );
}
