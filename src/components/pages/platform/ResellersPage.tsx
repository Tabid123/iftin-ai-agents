import { useEffect, useState } from 'react'
import { Link } from "@/lib/router-compat"
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, ExternalLink, Copy } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

interface Row {
  id: string; slug: string; name: string; status: string;
  current_period_end: string | null;
  subscription_plans?: { name: string; price_monthly: number } | null;
}

const statusVariant = (s: string): any =>
  s === 'active' ? 'default' : s === 'trial' ? 'secondary' : 'destructive'

export default function ResellersPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [emails, setEmails] = useState<Record<string, string>>({})

  const copyText = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text)
    toast({ title: `✅ ${label} waa la copy gareeyay` })
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('tenants')
        .select('id, slug, name, status, current_period_end, subscription_plans(name, price_monthly)')
        .order('created_at', { ascending: false })
      setRows((data ?? []) as any); setLoading(false)
      const { data: em } = await supabase.rpc('get_tenant_owner_emails')
      const map: Record<string, string> = {}
      for (const r of (em ?? []) as any[]) if (r.owner_email) map[r.tenant_id] = r.owner_email
      setEmails(map)
    })()
  }, [])

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Resellers</h1>
        <Button asChild>
          <Link to="/admin/resellers/new"><Plus className="h-4 w-4 mr-1" /> Cusub</Link>
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr className="text-left">
              <th className="p-3">Name</th>
              <th className="p-3">Email & Links</th>
              <th className="p-3">Plan</th>
              <th className="p-3">Status</th>
              <th className="p-3">Period end</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="p-6 text-center">Loading…</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">
                Reseller weli ma jirto. Bilow "Cusub".
              </td></tr>
            )}
            {rows.map(r => (
              <tr key={r.id} className="border-t">
                <td className="p-3 font-medium">{r.name}</td>
                <td className="p-3 text-xs space-y-1">
                  <div className="flex items-center gap-1">
                    <span className="font-mono">{emails[r.id] ?? '—'}</span>
                    {emails[r.id] && (
                      <Button variant="ghost" size="sm" className="h-6 px-1"
                        onClick={() => copyText(emails[r.id], 'Email')}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <a href={`/t/${r.slug}/providers`} target="_blank" rel="noreferrer"
                      className="text-primary hover:underline font-mono">
                      iftinagents.com/t/{r.slug}
                    </a>
                    <Button variant="ghost" size="sm" className="h-6 px-1"
                      onClick={() => copyText(`https://iftinagents.com/t/${r.slug}`, 'Link-ga macaamiisha')}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-muted-foreground">
                      iftinagents.com/t/{r.slug}/dashboard/login
                    </span>
                    <Button variant="ghost" size="sm" className="h-6 px-1"
                      onClick={() => copyText(`https://iftinagents.com/t/${r.slug}/dashboard/login`, 'Admin link')}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </td>

                <td className="p-3">{r.subscription_plans?.name ?? '—'}</td>
                <td className="p-3"><Badge variant={statusVariant(r.status)}>{r.status}</Badge></td>
                <td className="p-3 text-xs">
                  {r.current_period_end ? new Date(r.current_period_end).toLocaleDateString() : '—'}
                </td>
                <td className="p-3 text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link to={`/admin/resellers/${r.id}`}>
                      Maamul <ExternalLink className="h-3 w-3 ml-1" />
                    </Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
