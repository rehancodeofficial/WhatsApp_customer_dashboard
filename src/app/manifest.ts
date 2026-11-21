import type { MetadataRoute } from 'next';

// Makes the dashboard installable as an app ("Install app" on Android, "Add to Home Screen" on iPhone).
// Served at /manifest.webmanifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/dashboard',
    name: 'Phone Buzz Dashboard',
    short_name: 'Phone Buzz',
    description: 'Phone Buzz FZCO: WhatsApp chats, customers, orders, inventory and suppliers.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#1E293B',
    theme_color: '#1E293B',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
