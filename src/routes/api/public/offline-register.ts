// Public proxy to the Iftin Partner offline-registration endpoint.
// Callers are our own storefront users (phone-verified, no Supabase session),
// so the endpoint is public but strictly validated and tenant-scoped.
// The ift_live_… key never reaches the browser.
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/offline-register')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const {
          buildOfflinePayload,
          callOfflineApi,
          getTenantApiKeyByTenant,
          isUuid,
        } = await import('@/lib/iftinOffline.server');

        let input: any = null;
        try {
          input = await request.json();
        } catch {
          return Response.json({ ok: false, error: 'invalid_json', message: 'Body-ga sax ma aha' }, { status: 400 });
        }

        const tenantId = String(input?.tenant_id ?? request.headers.get('x-tenant-id') ?? '').trim();
        if (!isUuid(tenantId)) {
          return Response.json(
            { ok: false, error: 'missing_tenant', message: 'Tenant-ka lama aqoonsan' },
            { status: 400 },
          );
        }

        const built = buildOfflinePayload(input);
        if (!built.ok) {
          return Response.json({ ok: false, error: built.error, message: built.message }, { status: 400 });
        }

        const apiKey = await getTenantApiKeyByTenant(tenantId);
        if (!apiKey) {
          return Response.json(
            { ok: false, error: 'missing_api_key', message: 'Iftin API key lama dejin' },
            { status: 400 },
          );
        }

        console.log(
          `[offline-register] tenant=${tenantId} payload=${JSON.stringify(built.payload)}`,
        );

        const { status, body } = await callOfflineApi(apiKey, built.payload);
        const ok = status >= 200 && status < 300;
        console.log(`[offline-register] -> ${status} ${JSON.stringify(body).slice(0, 500)}`);

        return Response.json(
          {
            ok,
            status,
            error: ok ? null : (body?.error ?? `iftin_error_${status}`),
            message: body?.message ?? null,
            data: body,
          },
          { status: ok ? 200 : status || 502 },
        );
      },
    },
  },
});
