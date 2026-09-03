export const metadata = {
  title: "Raport Integrasi | Pondok Modern Al-Ghozali",
  description: "Sistem input nilai guru Pondok Modern Al-Ghozali"
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
