import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { I18nProvider } from "@/components/I18nProvider";
import { getLang } from "@/lib/i18n-server";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "thenoticeboard — verified government job notices", template: "%s · thenoticeboard" },
  description:
    "Deadlines, fees, eligibility and official links for UPSC, SSC, banking, railways, defence, PSU, state PSC and verified private recruitment in India.",
};

// Applies saved/system theme before paint to avoid a flash.
const themeScript = `try{var t=localStorage.getItem('tnb-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <I18nProvider lang={lang}>
          <Header />
          <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
          <Footer />
        </I18nProvider>
      </body>
    </html>
  );
}
