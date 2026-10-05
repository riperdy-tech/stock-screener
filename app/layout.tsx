import type { Metadata } from "next";
import { Hanken_Grotesk, Spline_Sans_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";

import { LanguageProvider } from "../components/LanguageContext";

// UI/body face. Data, micro-labels, table headers and transcripts use the mono.
const hanken = Hanken_Grotesk({
    subsets: ["latin"],
    weight: ["400", "500", "600", "700", "800"],
    variable: "--font-hanken",
    display: "swap",
});
const spline = Spline_Sans_Mono({
    subsets: ["latin"],
    weight: ["400", "500", "600"],
    variable: "--font-spline",
    display: "swap",
});

// Stockpeak v3 desk faces (design_handoff_stockpeak_v3 README 3.2). Loaded as extra variables;
// only the desk's `.theme-light` scope points font-sans / font-mono at them. Geist Mono is not in
// next/font/google's catalogue in Next 14.2.3, so it is loaded by the <link> in the layout head
// below (family name referenced in app/globals.css).
const instrument = Instrument_Sans({
    subsets: ["latin"],
    weight: ["400", "600", "700"],
    variable: "--font-instrument",
    display: "swap",
});

export const metadata: Metadata = {
    title: "Stockpeak — Institutional Underwriting Desk",
    description: "A quant screen narrows the US market to a shortlist; an AI analyst values each name; code checks every verdict before it counts. Research, not investment advice.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <head>
                {/* eslint-disable-next-line @next/next/no-page-custom-font */}
                <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;600&display=swap" />
            </head>
            <body className={`${hanken.variable} ${spline.variable} ${instrument.variable} font-sans`}>
                <LanguageProvider>
                    {children}
                </LanguageProvider>
            </body>
        </html>
    );
}
