import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gym-Shym",
  description: "Compete with your gym buddy on effort, not raw numbers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
