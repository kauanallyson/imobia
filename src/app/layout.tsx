import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import type { Metadata } from "next";
import { Tuffy } from "next/font/google";
import { theme } from "./theme";
import "./globals.css";

const tuffy = Tuffy({
  variable: "--font-tuffy",
  weight: ["400", "700"],
  subsets: ["latin", "latin-ext"],
  fallback: ["Roboto", "sans-serif"],
});

export const metadata: Metadata = {
  title: { default: "loteAI", template: "%s · loteAI" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${tuffy.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <AppRouterCacheProvider options={{ enableCssLayer: true }}>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            {children}
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
