import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken", display: "swap" });

export const metadata: Metadata = {
  title: { default: "BillSplit", template: "%s · BillSplit" },
  description: "Split shared costs with friends and groups, and always know who owes what.",
  applicationName: "BillSplit",
  // Installed on an iPhone home screen: full screen, with the app's name under the icon.
  appleWebApp: { capable: true, title: "BillSplit", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the layout use env(safe-area-inset-*) around the notch and home indicator.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1524" },
  ],
};

// Applies a saved theme choice before first paint (no flash). Defaults to the OS setting.
const themeScript = `try{var t=localStorage.getItem("bs-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={hanken.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            className: "!bg-surface !text-ink !border-rule !font-sans !rounded-[10px]",
          }}
        />
      </body>
    </html>
  );
}
