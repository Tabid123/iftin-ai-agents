import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Loader2, Plus, Pencil, Trash2, RefreshCw, Search, Tag, AlertTriangle, Activity, Check, X,
} from 'lucide-react';

type Root = {
  id: string;
  package_name: string;
  provider_id: string;
  category_id: string | null;
  is_active: boolean;
  is_discovery_root: boolean;
  connection_type_label: string | null;
};

type PriceRow = {
  id?: string;
  root_package_id: string;
  label: string;
  cost_price: number;
  selling_price: number;
  info_line1: string | null;
  info_line2: string | null;
  is_active: boolean;
};

type Unmatched = {
  id: string;
  root_package_id: string;
  raw_label: string;
  hits: number;
  last_seen_at: string;
};

type Session = {
  id: string;
  phone_number: string;
  status: string;
  device_id: string | null;
  session_state: string;
  selected_label: string | null;
  error: string | null;
  queued_at: string;
  claimed_at: string | null;
};

const TABS = [
  { key: 'roots', label: 'Xirmooyinka', icon: Tag },
  { key: 'prices', label: 'Qiimaha', icon: Search },
  { key: 'unmatched', label: 'Aan la helin', icon: AlertTriangle },
  { key: 'sessions', label: 'Sessions', icon: Activity },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const emptyPrice = (rootId: string): PriceRow => ({
  root_package_id: rootId,
  label: '',
  cost_price: 0,
  selling_price: 0,
  info_line1: '',
  info_line2: '',
  is_active: true,
});

const statusLabel = (s: Session) => {
  if (s.status === 'pending') return 'Safka ku jira';
  if (s.status === 'processing') return 'Waa la baarayaa';
  if (s.status === 'done') return 'Menu diyaar';
  if (s.status === 'failed') return 'Fashilmay';
  return s.status;
};

const statusColor = (s: Session) => {
  if (s.status === 'done') return 'bg-emerald-100 text-emerald-700';
  if (s.status === 'failed') return 'bg-red-100 text-red-700';
  if (s.status === 'processing') return 'bg-blue-100 text-blue-700';
  return 'bg-amber-100 text-amber-700';
};

export default function DiscoveryPricing() {
  const [tab, setTab] = useState<TabKey>('roots');
  const [loading, setLoading] = useState(true);
  const [roots, setRoots] = useState<Root[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [unmatched, setUnmatched] = useState<Unmatched[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedRoot, setSelectedRoot] = useState<string>('');

  const [rootForm, setRootForm] = useState<{ id?: string; provider_id: string; category_id: string; package_name: string; label: string; is_active: boolean } | null>(null);
  const [priceForm, setPriceForm] = useState<PriceRow | null>(null);

  const load = useCallback(async () => {
    const [rootRes, provRes, catRes, sessRes] = await Promise.all([
      supabase.from('data_packages_config').select('id, package_name, provider_id, category_id, is_active, is_discovery_root, connection_type_label').eq('is_discovery_root', true).order('display_order'),
      supabase.from('providers_config').select('id, provider_name').order('display_order'),
      supabase.from('package_categories').select('id, category_name, provider_id').order('display_order'),
      supabase.from('ussd_package_discoveries').select('id, phone_number, status, device_id, session_state, selected_label, error, queued_at, claimed_at').order('queued_at', { ascending: false }).limit(40),
    ]);
    const rootList = (rootRes.data || []) as Root[];
    setRoots(rootList);
    setProviders(provRes.data || []);
    setCategories(catRes.data || []);
    setSessions((sessRes.data || []) as Session[]);
    setSelectedRoot(prev => prev || rootList[0]?.id || '');
    setLoading(false);
  }, []);

  const loadRootData = useCallback(async (rootId: string) => {
    if (!rootId) { setPrices([]); setUnmatched([]); return; }
    const [priceRes, unmatchedRes] = await Promise.all([
      supabase.from('ussd_price_catalog').select('id, root_package_id, label, cost_price, selling_price, info_line1, info_line2, is_active').eq('root_package_id', rootId).order('selling_price'),
      supabase.from('discovery_unmatched_labels').select('id, root_package_id, raw_label, hits, last_seen_at').eq('root_package_id', rootId).order('last_seen_at', { ascending: false }),
    ]);
    setPrices((priceRes.data || []) as PriceRow[]);
    setUnmatched((unmatchedRes.data || []) as Unmatched[]);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadRootData(selectedRoot); }, [selectedRoot, loadRootData]);

  useEffect(() => {
    if (tab !== 'sessions') return;
    const id = window.setInterval(() => { void load(); }, 15000);
    return () => window.clearInterval(id);
  }, [tab, load]);

  const providerName = (id: string) => providers.find(p => p.id === id)?.provider_name || '—';
  const rootCategories = useMemo(
    () => (rootForm?.provider_id ? categories.filter(c => c.provider_id === rootForm.provider_id) : categories),
    [categories, rootForm?.provider_id],
  );

  // ---------- roots ----------
  const saveRoot = async () => {
    if (!rootForm?.provider_id || !rootForm.package_name.trim()) { toast.error('Fadlan buuxi shirkadda iyo magaca'); return; }
    const payload: any = {
      provider_id: rootForm.provider_id,
      category_id: rootForm.category_id || null,
      package_name: rootForm.package_name.trim(),
      connection_type_label: rootForm.label.trim() || rootForm.package_name.trim(),
      is_active: rootForm.is_active,
      is_discovery_root: true,
    };
    if (rootForm.id) {
      const { error } = await supabase.from('data_packages_config').update(payload).eq('id', rootForm.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from('data_packages_config').insert([{
        ...payload,
        data_amount: 'Live',
        validity_days: '—',
        selling_price: 0,
        cost_price: 0,
        ussd_code: '*212*{receiver_phone}#',
      }]);
      if (error) { toast.error(error.message); return; }
    }
    toast.success('La keydiyay');
    setRootForm(null);
    void load();
  };

  const deleteRoot = async (id: string) => {
    if (!confirm('Ma hubtaa inaad tirtirto?')) return;
    const { error } = await supabase.from('data_packages_config').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('La tirtiray');
    void load();
  };

  const toggleRoot = async (root: Root) => {
    const { error } = await supabase.from('data_packages_config').update({ is_active: !root.is_active }).eq('id', root.id);
    if (error) { toast.error(error.message); return; }
    void load();
  };

  // ---------- prices ----------
  const savePrice = async () => {
    if (!priceForm || !priceForm.label.trim()) { toast.error('Fadlan geli label-ka'); return; }
    const payload = {
      root_package_id: priceForm.root_package_id,
      label: priceForm.label.trim(),
      cost_price: Number(priceForm.cost_price) || 0,
      selling_price: Number(priceForm.selling_price) || 0,
      info_line1: priceForm.info_line1 || null,
      info_line2: priceForm.info_line2 || null,
      is_active: priceForm.is_active,
    };
    const { error } = priceForm.id
      ? await supabase.from('ussd_price_catalog').update(payload).eq('id', priceForm.id)
      : await supabase.from('ussd_price_catalog').insert([payload as any]);
    if (error) { toast.error(error.message); return; }
    toast.success('Qiimaha waa la keydiyay');
    setPriceForm(null);
    void loadRootData(selectedRoot);
  };

  const deletePrice = async (id?: string) => {
    if (!id || !confirm('Ma hubtaa inaad tirtirto?')) return;
    const { error } = await supabase.from('ussd_price_catalog').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    void loadRootData(selectedRoot);
  };

  const dismissUnmatched = async (id: string) => {
    const { error } = await supabase.from('discovery_unmatched_labels').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    setUnmatched(prev => prev.filter(u => u.id !== id));
  };

  const priceFromUnmatched = (u: Unmatched) => {
    setPriceForm({ ...emptyPrice(u.root_package_id), label: u.raw_label });
    setTab('prices');
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-gray-400" /></div>;
  }

  const rootSelector = (
    <select
      value={selectedRoot}
      onChange={e => { setSelectedRoot(e.target.value); setPriceForm(null); }}
      className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border text-sm outline-none"
    >
      {roots.length === 0 && <option value="">Xirmo baaris ah majirto</option>}
      {roots.map(r => <option key={r.id} value={r.id}>{r.package_name} · {providerName(r.provider_id)}</option>)}
    </select>
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${tab === t.key ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border'}`}
          >
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
        <button onClick={() => { void load(); void loadRootData(selectedRoot); }} className="ml-auto px-3 py-2 rounded-xl bg-white dark:bg-gray-800 border text-xs font-bold flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Cusboonaysii
        </button>
      </div>

      {tab === 'roots' && (
        <div className="space-y-3">
          <button
            onClick={() => setRootForm(rootForm ? null : { provider_id: providers[0]?.id || '', category_id: '', package_name: '', label: '', is_active: true })}
            className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Xirmo Baaris Cusub
          </button>

          {rootForm && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border p-3 space-y-2">
              <select value={rootForm.provider_id} onChange={e => setRootForm({ ...rootForm, provider_id: e.target.value, category_id: '' })} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none">
                <option value="">Dooro shirkadda *</option>
                {providers.map(p => <option key={p.id} value={p.id}>{p.provider_name}</option>)}
              </select>
              <select value={rootForm.category_id} onChange={e => setRootForm({ ...rootForm, category_id: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none">
                <option value="">Category (tusaale: Maamuus)</option>
                {rootCategories.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}
              </select>
              <input value={rootForm.package_name} onChange={e => setRootForm({ ...rootForm, package_name: e.target.value })} placeholder="Magaca (Data / Kuhadal / Data iyo Kuhadal)" className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
              <input value={rootForm.label} onChange={e => setRootForm({ ...rootForm, label: e.target.value })} placeholder="Label (ikhtiyaari)" className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <input type="checkbox" checked={rootForm.is_active} onChange={e => setRootForm({ ...rootForm, is_active: e.target.checked })} /> Shaqeynaya
              </label>
              <div className="flex gap-2">
                <button onClick={saveRoot} className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-bold">Keydi</button>
                <button onClick={() => setRootForm(null)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm">Jooji</button>
              </div>
            </div>
          )}

          {roots.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">Wali xirmo baaris ah lama dhisin.</p>
          ) : roots.map(root => (
            <div key={root.id} className="bg-white dark:bg-gray-800 rounded-xl border p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-sm text-gray-800 dark:text-white truncate">{root.package_name}</p>
                <p className="text-[11px] text-gray-400">{providerName(root.provider_id)} · {categories.find(c => c.id === root.category_id)?.category_name || 'Category la\'aan'}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => toggleRoot(root)} className={`px-2 py-1 rounded-lg text-[11px] font-bold ${root.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>
                  {root.is_active ? 'Shaqeynaya' : 'Damis'}
                </button>
                <button onClick={() => setRootForm({ id: root.id, provider_id: root.provider_id, category_id: root.category_id || '', package_name: root.package_name, label: root.connection_type_label || '', is_active: root.is_active })} className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => deleteRoot(root.id)} className="p-2 rounded-lg bg-red-50 text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'prices' && (
        <div className="space-y-3">
          {rootSelector}
          <button
            onClick={() => setPriceForm(priceForm ? null : emptyPrice(selectedRoot))}
            disabled={!selectedRoot}
            className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> Qiimo Cusub
          </button>

          {priceForm && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border p-3 space-y-2">
              <input value={priceForm.label} onChange={e => setPriceForm({ ...priceForm, label: e.target.value })} placeholder="Label (tusaale: $0.5=1GB 24H)" className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
              <div className="grid grid-cols-2 gap-2">
                <input type="text" inputMode="decimal" value={String(priceForm.cost_price)} onChange={e => setPriceForm({ ...priceForm, cost_price: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })} placeholder="Cost" className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
                <input type="text" inputMode="decimal" value={String(priceForm.selling_price)} onChange={e => setPriceForm({ ...priceForm, selling_price: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })} placeholder="Selling" className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
              </div>
              <input value={priceForm.info_line1 || ''} onChange={e => setPriceForm({ ...priceForm, info_line1: e.target.value })} placeholder="Info line 1 (tusaale: 1GB)" className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
              <input value={priceForm.info_line2 || ''} onChange={e => setPriceForm({ ...priceForm, info_line2: e.target.value })} placeholder="Info line 2 (tusaale: 24 Saac)" className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <input type="checkbox" checked={priceForm.is_active} onChange={e => setPriceForm({ ...priceForm, is_active: e.target.checked })} /> Shaqeynaya
              </label>
              <div className="flex gap-2">
                <button onClick={savePrice} className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-bold">Keydi</button>
                <button onClick={() => setPriceForm(null)} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm">Jooji</button>
              </div>
            </div>
          )}

          {prices.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">Qiimo wali lama dejin.</p>
          ) : prices.map(row => (
            <div key={row.id} className="bg-white dark:bg-gray-800 rounded-xl border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-sm text-gray-800 dark:text-white truncate">{row.label}</p>
                  <p className="text-[11px] text-gray-400">{row.info_line1 || '—'} · {row.info_line2 || '—'}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Cost ${Number(row.cost_price).toFixed(2)} · Iib ${Number(row.selling_price).toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {row.is_active ? <Check className="w-4 h-4 text-emerald-500" /> : <X className="w-4 h-4 text-gray-400" />}
                  <button onClick={() => setPriceForm(row)} className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deletePrice(row.id)} className="p-2 rounded-lg bg-red-50 text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'unmatched' && (
        <div className="space-y-3">
          {rootSelector}
          {unmatched.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">Dhammaan xirmooyinka qiimo bay leeyihiin.</p>
          ) : unmatched.map(u => (
            <div key={u.id} className="bg-white dark:bg-gray-800 rounded-xl border p-3 space-y-2">
              <p className="font-bold text-sm text-gray-800 dark:text-white break-words">{u.raw_label}</p>
              <p className="text-[11px] text-gray-400">{u.hits} jeer · {new Date(u.last_seen_at).toLocaleString()}</p>
              <div className="flex gap-2">
                <button onClick={() => priceFromUnmatched(u)} className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-xs font-bold">Qiimo u samee</button>
                <button onClick={() => dismissUnmatched(u.id)} className="px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-xs">Iska daa</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'sessions' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white dark:bg-gray-800 rounded-xl border p-3 text-center">
              <p className="text-lg font-bold">{sessions.filter(s => s.status === 'processing').length}</p>
              <p className="text-[11px] text-gray-400">Socda</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border p-3 text-center">
              <p className="text-lg font-bold">{sessions.filter(s => s.status === 'pending').length}</p>
              <p className="text-[11px] text-gray-400">Safka</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border p-3 text-center">
              <p className="text-lg font-bold">{new Set(sessions.map(s => s.device_id).filter(Boolean)).size}</p>
              <p className="text-[11px] text-gray-400">Aalado</p>
            </div>
          </div>
          {sessions.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">Session wali majiro.</p>
          ) : sessions.map(s => (
            <div key={s.id} className="bg-white dark:bg-gray-800 rounded-xl border p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-sm">+252{s.phone_number}</p>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColor(s)}`}>{statusLabel(s)}</span>
              </div>
              <p className="text-[11px] text-gray-400">Aalad: {s.device_id || '—'} · Xaalad: {s.session_state}</p>
              {s.selected_label && <p className="text-[11px] text-gray-500">Xirmada: {s.selected_label}</p>}
              {s.error && <p className="text-[11px] text-red-500">{s.error}</p>}
              <p className="text-[10px] text-gray-400">
                Safka: {new Date(s.queued_at).toLocaleTimeString()}{s.claimed_at ? ` · Bilaabay: ${new Date(s.claimed_at).toLocaleTimeString()}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
