import "./globals.css";

export const metadata = {
  title: "CotaMed",
  description: "Sistema de cotação automática",
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
