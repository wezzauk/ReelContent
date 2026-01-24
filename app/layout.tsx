import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reel Content",
  description: "Creator-friendly short-form content generator",
};

const themeInitScript = `
(function() {
  try {
    var saved = localStorage.getItem("rc-theme");
    var theme = saved ? saved : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    if (theme === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
