import type { Metadata } from "next";
import { Inter } from "next/font/google"; // Next.js optimizes fonts automatically
import "./globals.css";

import { LanguageProvider } from "../components/LanguageContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "Quant Screener",
    description: "Advanced Quantitative Stock Screener",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={inter.className}>
                <LanguageProvider>
                    {children}
                </LanguageProvider>
            </body>
        </html>
    );
}
