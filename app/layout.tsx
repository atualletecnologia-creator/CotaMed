import "./globals.css";

export const metadata = {
  title: "CotaMed",
  description: "Cotação inteligente para saúde",
  icons: { icon: "/brand/cotamed-icon.svg" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
      </body>
    </html>
  );
}
