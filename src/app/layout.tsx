import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { SupabaseProvider } from '@/components/providers/SupabaseProvider';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { InstallApp } from '@/components/InstallApp';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'PhoneBuzz WhatsApp Inbox Dashboard',
  description: 'AI sales agent inbox & takeover dashboard for Phone Buzz FZCO',
  applicationName: 'Phone Buzz',
  // Installed app on iPhone ("Add to Home Screen"): full screen, own name and icon.
  appleWebApp: { capable: true, title: 'Phone Buzz', statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#1E293B',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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
        <InstallApp />
      </body>
    </html>
  );
}
