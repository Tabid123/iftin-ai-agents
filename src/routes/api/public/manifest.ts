// Per-tenant PWA manifest. Served publicly so the browser can fetch it
// without credentials during install ("Add to Home Screen").
import { createFileRoute } from '@tanstack/react-router';

const SUPABASE_URL = 'https://bpkddmxpyeyxvjyebull.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwa2RkbXhweWV5eHZqeWVidWxsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NTQ5NzEsImV4cCI6MjA5NjMzMDk3MX0.vHVvxVI2x87aWeiNlzwIoCqU1y-tNlvbc0j_PJcRuvk';

const DEFAULT_THEME = '#1E3A8A';

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value.trim());
}

export const Route = createFileRoute('/api/public/manifest')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const slug = (url.searchParams.get('tenant') || '').trim().toLowerCase();

        let name = 'Iftin Agents';
        let shortName = 'Iftin';
        let themeColor = DEFAULT_THEME;
        let icon = '/icon-512.png';
        let scope = '/';

        if (slug && /^[a-z0-9-]{1,60}$/.test(slug)) {
          try {
            const res = await fetch(
              `${SUPABASE_URL}/rest/v1/tenants?slug=eq.${encodeURIComponent(slug)}&select=name,slug,logo_url,primary_color&limit=1`,
              { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
            );
            const rows = res.ok ? ((await res.json()) as any[]) : [];
            const tenant = rows?.[0];
            if (tenant) {
              name = String(tenant.name || name);
              shortName = name.split(' ')[0]?.slice(0, 12) || shortName;
              if (isHexColor(tenant.primary_color)) themeColor = tenant.primary_color.trim();
              if (typeof tenant.logo_url === 'string' && tenant.logo_url.startsWith('http')) {
                icon = tenant.logo_url;
              }
              scope = `/t/${slug}/`;
            }
          } catch {
            /* fall back to platform defaults */
          }
        }

        const manifest = {
          name,
          short_name: shortName,
          description: `${name} — iibso xirmooyinka internet-ka iyo airtime-ka.`,
          start_url: scope,
          scope,
          id: scope,
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#ffffff',
          theme_color: themeColor,
          lang: 'so',
          dir: 'ltr',
          categories: ['business', 'utilities'],
          icons: [
            { src: icon, sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: icon, sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: icon, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        };

        return new Response(JSON.stringify(manifest), {
          headers: {
            'Content-Type': 'application/manifest+json; charset=utf-8',
            'Cache-Control': 'public, max-age=300, must-revalidate',
            'Access-Control-Allow-Origin': '*',
          },
        });
      },
    },
  },
});
