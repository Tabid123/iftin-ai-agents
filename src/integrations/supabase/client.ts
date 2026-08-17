import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://bpkddmxpyeyxvjyebull.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwa2RkbXhweWV5eHZqeWVidWxsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NTQ5NzEsImV4cCI6MjA5NjMzMDk3MX0.vHVvxVI2x87aWeiNlzwIoCqU1y-tNlvbc0j_PJcRuvk";

const TENANT_STORAGE_KEY = 'iftin:tenant-id';

type TenantChangeListener = (prev: string | null, next: string | null) => void;

let currentTenantId: string | null =
  typeof window !== 'undefined' ? window.localStorage.getItem(TENANT_STORAGE_KEY) : null;

const tenantListeners = new Set<TenantChangeListener>();

/** Current tenant id used for the `x-tenant-id` header. */
export function getTenantId(): string | null {
  return currentTenantId;
}

/** Sets (or clears) the tenant scoping every Supabase request. */
export function setTenantHeader(tenantId: string | null) {
  const prev = currentTenantId;
  if (prev === tenantId) return;
  currentTenantId = tenantId;
  if (typeof window !== 'undefined') {
    try {
      if (tenantId) window.localStorage.setItem(TENANT_STORAGE_KEY, tenantId);
      else window.localStorage.removeItem(TENANT_STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }
  for (const listener of tenantListeners) {
    try {
      listener(prev, tenantId);
    } catch {
      /* listener errors must not break the app */
    }
  }
}

/** Subscribes to tenant switches. Returns an unsubscribe function. */
export function registerTenantChangeListener(listener: TenantChangeListener): () => void {
  tenantListeners.add(listener);
  return () => {
    tenantListeners.delete(listener);
  };
}

/** fetch wrapper that attaches the current tenant header. */
export function tenantAwareFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers ?? {});
  if (currentTenantId) headers.set('x-tenant-id', currentTenantId);
  return fetch(input, { ...init, headers });
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

// NOTE: tenant_id is filled in by a database trigger (set_tenant_id_default),
// so inserts legitimately omit it. The generated types mark it required, which
// would break every insert — we relax the insert typing here.
const rawClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: typeof window !== 'undefined' ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    fetch: tenantAwareFetch,
  },
});

export const supabase = rawClient as unknown as ReturnType<typeof createClient<any, 'public', any>>;

