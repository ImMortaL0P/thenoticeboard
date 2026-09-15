import type { Metadata } from "next";
import { Newsreader, Inter, IBM_Plex_Mono, Noto_Sans_Devanagari, Noto_Serif_Devanagari } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { I18nProvider } from "@/components/I18nProvider";
import { getLang } from "@/lib/i18n-server";

// Editorial pairing: a newspaper serif for headlines, a neutral grotesque for
// interface text, a mono for dates, serial numbers and other record metadata.
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
  style: ["normal", "italic"],
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});
const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-devanagari",
  display: "swap",
});
const notoSerifDevanagari = Noto_Serif_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-devanagari-serif",
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
      className={`${newsreader.variable} ${inter.variable} ${plexMono.variable} ${notoDevanagari.variable} ${notoSerifDevanagari.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <I18nProvider lang={lang}>
          <Header />
          <main className="mx-auto w-full max-w-[78rem] px-4 py-6 sm:px-6 sm:py-8">{children}</main>
          <Footer />
        </I18nProvider>
      </body>
    </html>
  );
}
