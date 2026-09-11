import type { Metadata } from "next";
import { Instrument_Sans, Noto_Sans_Devanagari, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { I18nProvider } from "@/components/I18nProvider";
import { getLang } from "@/lib/i18n-server";

const instrument = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});
const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-devanagari",
  display: "swap",
});
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "thenoticeboard — verified government job notices", template: "%s · thenoticeboard" },
  description:
    "Deadlines, fees, eligibility and official links for UPSC, SSC, banking, railways, defence, PSU, state PSC and verified private recruitment in India.",
};

// Default is light; dark only when the visitor has explicitly chosen it.
const themeScript = `try{if(localStorage.getItem('tnb-theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html
      lang={lang}
      className={`${instrument.variable} ${notoDevanagari.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <I18nProvider lang={lang}>
          <Header />
          <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
          <Footer />
        </I18nProvider>
      </body>
    </html>
  );
}
