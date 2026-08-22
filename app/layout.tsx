import type { Metadata } from "next";
import { Hanken_Grotesk, Spline_Sans_Mono } from "next/font/google";
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

export const metadata: Metadata = {
    title: "Stockpeak — AI Research Desk",
    description: "RS2 depth verdicts over a sector-neutral quant filter: valuation bands, a public paper-trade record, and a model-checked portfolio.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={`${hanken.variable} ${spline.variable} font-sans`}>
                <LanguageProvider>
                    {children}
                </LanguageProvider>
            </body>
        </html>
    );
}
