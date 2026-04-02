import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import ToasterProvider from '@/components/ToasterProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Café Itaoca CRM - Produção',
  description: 'Sistema de gestão de produção de café',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <ToasterProvider />
        {children}
      </body>
    </html>
  );
}
