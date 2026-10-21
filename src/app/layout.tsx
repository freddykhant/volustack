import "~/styles/globals.css";

import { type Metadata, type Viewport } from "next";

import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "Mesodapt",
  description: "The AI operating system for self-coached athletes.",
};

export const viewport: Viewport = {
  themeColor: "#faf9f7",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-canvas font-sans text-body text-fg antialiased">
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
