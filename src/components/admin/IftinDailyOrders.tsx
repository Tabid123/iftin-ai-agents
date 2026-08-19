import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Search, Package, CheckCircle, Clock, XCircle, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { resolveTenantId } from '@/lib/iftinCatalog';
import {
  listPartnerIntents,
  type PartnerIntent,
  type PartnerIntentsData,
} from '@/lib/iftinIntents.functions';

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Mogadishu',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const when = (iso?: string | null) => (iso ? timeFmt.format(new Date(iso)) : '—');
const money = (n: number | null | undefined) => `$${Number(n ?? 0).toFixed(2)}`;

const badgeClass = (result: string) => {
  switch (result) {
    case 'delivered':
      return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
    case 'delivering':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
    default:
      return 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }
};

type Tab = 'orders' | 'unpaid';

const IftinDailyOrders: React.FC<{ isSo?: boolean }> = ({ isSo = true }) => {
  const [tab, setTab] = useState<Tab>('orders');
  const [data, setData] = useState<PartnerIntentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const tenantId = await resolveTenantId();
        if (!tenantId) throw new Error('Reseller-ka lama garanayo');
        const res = await listPartnerIntents({
          data: { tenantId, limit: 100, includeUnpaid: tab === 'unpaid' },
        });
        setData(res);
      } catch (e: any) {
        setError(e?.message ?? 'Dalabyada lama soo dejin');
      } finally {
        setLoading(false);
      }
    },
    [tab],
  );

  // Full refresh from the API on mount / tab change (server is source of truth).
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => void load(true), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const summary = data?.summary;

  const rows = useMemo(() => {
    const all = data?.intents ?? [];
    const list =
      tab === 'orders'
        ? all.filter((i) => i.counts_as_order === true)
        : all.filter((i) => i.counts_as_order === false);
    const q = search.replace(/\D/g, '');
    if (!q) return list;
    return list.filter(
      (i) => (i.receiver_phone ?? '').includes(q) || (i.sender_phone ?? '').includes(q),
    );
  }, [data, tab, search]);

  const revenue = useMemo(
    () =>
      (data?.intents ?? [])
        .filter((i) => i.counts_as_order)
        .reduce((s, i) => s + Number(i.amount ?? 0), 0),
    [data],
  );

  const cards = [
    { label: isSo ? 'Wadarta' : 'Total', value: summary?.orders ?? 0, icon: Package, color: 'bg-purple-500' },
    { label: isSo ? 'La diray' : 'Delivered', value: summary?.delivered ?? 0, icon: CheckCircle, color: 'bg-green-500' },
    { label: isSo ? 'Sugaya' : 'Delivering', value: summary?.delivering ?? 0, icon: Clock, color: 'bg-amber-500' },
    { label: isSo ? 'Guuldarraystay' : 'Failed', value: summary?.failed ?? 0, icon: XCircle, color: 'bg-red-500' },
    { label: isSo ? 'Dakhli' : 'Revenue', value: money(revenue), icon: DollarSign, color: 'bg-emerald-500' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button size="sm" variant={tab === 'orders' ? 'default' : 'outline'} onClick={() => setTab('orders')}>
            {isSo ? 'Dalabyada' : 'Orders'}
          </Button>
          <Button size="sm" variant={tab === 'unpaid' ? 'default' : 'outline'} onClick={() => setTab('unpaid')}>
            {isSo ? 'Lacag lama bixin' : 'Unpaid'}
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
        {cards.map((c) => (
          <Card key={c.label} className="p-2.5">
            <div className={`w-7 h-7 rounded-lg ${c.color} flex items-center justify-center mb-1.5`}>
              <c.icon className="w-4 h-4 text-white" />
            </div>
            <div className="text-lg font-bold leading-tight">{c.value}</div>
            <div className="text-[11px] text-muted-foreground">{c.label}</div>
          </Card>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder={isSo ? 'Raadi lambar...' : 'Search phone...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-3 text-sm">
          {error}
        </div>
      )}

      {loading && !data ? (
        <Card className="p-6 text-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin inline" />
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground text-sm">
          {isSo ? 'Wax dalab ah lama helin' : 'No orders found'}
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((i: PartnerIntent) => (
            <Card key={i.intent_id} className="p-3 space-y-1.5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{money(i.amount)}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {i.sender_phone ?? '—'} → {i.receiver_phone ?? '—'}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badgeClass(i.result)}`}>
                  {(isSo ? i.result_label : i.result_label_en) ?? i.result_label ?? i.result_label_en ?? '—'}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{when(i.created_at)}</span>
                <span className="truncate max-w-full">{i.package_name ?? '—'}</span>
                {i.data_amount && <span>{i.data_amount}</span>}
              </div>
              {i.result === 'failed' && i.reason && (
                <div className="text-xs text-red-600 dark:text-red-400 break-words">{i.reason}</div>
              )}
            </Card>
          ))}
        </div>
      )}

      {tab === 'unpaid' && (
        <p className="text-[11px] text-muted-foreground text-center">
          {isSo
            ? `Lacag lama bixin — kuwan dalab lama tirinayo (${data?.unpaid_ttl_minutes ?? 60} daqiiqo kadib way dhacaan).`
            : `Unpaid intents are not orders (they expire after ${data?.unpaid_ttl_minutes ?? 60} minutes).`}
        </p>
      )}
    </div>
  );
};

export default IftinDailyOrders;
