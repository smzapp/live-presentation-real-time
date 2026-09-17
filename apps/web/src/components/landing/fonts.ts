import { Bricolage_Grotesque, DM_Sans, JetBrains_Mono } from "next/font/google";

export const lpDisplay = Bricolage_Grotesque({
  variable: "--font-lp-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const lpSans = DM_Sans({
  variable: "--font-lp-sans",
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
});

export const lpMono = JetBrains_Mono({
  variable: "--font-lp-mono",
  subsets: ["latin"],
  weight: ["500", "700"],
});

export const lpFontVariables = `${lpDisplay.variable} ${lpSans.variable} ${lpMono.variable}`;
