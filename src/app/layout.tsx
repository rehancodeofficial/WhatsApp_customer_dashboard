import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { SupabaseProvider } from '@/components/providers/SupabaseProvider';
import { QueryProvider } from '@/components/providers/QueryProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'PhoneBuzz WhatsApp Inbox Dashboard',
  description: 'AI sales agent inbox & takeover dashboard for Phone Buzz FZCO',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} h-full antialiased`}>
        <SupabaseProvider>
          <QueryProvider>{children}</QueryProvider>
        </SupabaseProvider>
      </body>
    </html>
  );
}
