export const metadata = {
  title: "Raport Integrasi Al-Ghozali",
  description: "Sistem Raport Integrasi Pondok Modern Al-Ghozali",
  openGraph: {
    title: "Raport Integrasi Al-Ghozali",
    description: "Sistem Raport Integrasi Pondok Modern Al-Ghozali",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
