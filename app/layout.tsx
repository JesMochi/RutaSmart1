import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "RutaSmart",
  description: "Plataforma comunitaria para organizar recolecciones de reciclables.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-MX" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
