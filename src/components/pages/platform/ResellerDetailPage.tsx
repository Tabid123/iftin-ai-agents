import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from "@/lib/router-compat"
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/hooks/use-toast'
import { ArrowLeft, Loader2, Upload, X, KeyRound, Copy, Check, UserCog } from 'lucide-react'
import ThemePreview from '@/components/platform/ThemePreview'
import PartnerApiTab from '@/components/platform/PartnerApiTab'
import CachedImage from '@/components/CachedImage'


export default function ResellerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [tenant, setTenant] = useState<any>(null)
  const [plans, setPlans] = useState<any[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [payForm, setPayForm] = useState({
    amount: 0, payment_method: 'EVC', period_days: 30, notes: '',
  })
  const [saving, setSaving] = useState(false)

  // Live preview state — controlled while typing
  const [name, setName] = useState('')
  const [primary, setPrimary] = useState('')
  const [accent, setAccent] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Reset password state
  const [resetting, setResetting] = useState(false)
  const [newCreds, setNewCreds] = useState<{ email: string | null; password: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [impersonating, setImpersonating] = useState(false)

  const impersonate = async () => {
    setImpersonating(true)
    try {
      const { data, error } = await supabase.functions.invoke('platform-impersonate-tenant', {
        body: { tenant_id: id },
      })
      if (error || (data as any)?.error) throw new Error((data as any)?.error ?? error?.message)
      const link = (data as any).action_link
      if (!link) throw new Error('Link lama helin')
      window.open(link, '_blank', 'noopener')
      toast({ title: '✅ Impersonation link la furay', description: (data as any).owner_email })
    } catch (e: any) {
      toast({ title: 'Khalad', description: e.message, variant: 'destructive' })
    } finally { setImpersonating(false) }
  }

  const resetPassword = async () => {
    if (!confirm('Ma hubtaa inaad password cusub u abuurto reseller-kan? Password-kii hore wuu shaqayn doonin.')) return
    setResetting(true)
    try {
      const { data, error } = await supabase.functions.invoke('platform-reset-tenant-password', {
        body: { tenant_id: id },
      })
      if (error || (data as any)?.error) throw new Error((data as any)?.error ?? error?.message)
      setNewCreds({ email: data.email, password: data.password })
      setCopied(false)
      toast({ title: '✅ Password cusub waa la abuuray' })
    } catch (e: any) {
      toast({ title: 'Khalad', description: e.message, variant: 'destructive' })
    } finally { setResetting(false) }
  }

  const copyCreds = async () => {
    if (!newCreds) return
    const text = `Email: ${newCreds.email}\nPassword: ${newCreds.password}`
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const load = async () => {
    const [{ data: t }, { data: pl }, { data: ps }] = await Promise.all([
      supabase.from('tenants').select('*').eq('id', id).single(),
      supabase.from('subscription_plans').select('*').eq('is_active', true),
      supabase.from('tenant_subscriptions').select('*')
        .eq('tenant_id', id).order('paid_at', { ascending: false }).limit(20),
    ])
    setTenant(t); setPlans(pl ?? []); setPayments(ps ?? []); setLoading(false)
    if (t) {
      setName(t.name ?? '')
      setPrimary(t.primary_color ?? '')
      setAccent((t as any).accent_color ?? '')
      setLogoUrl(t.logo_url ?? null)
    }
  }
  useEffect(() => { load() }, [id])

  const update = async (patch: any) => {
    setSaving(true)
    const { error } = await supabase.from('tenants').update(patch).eq('id', id)
    setSaving(false)
    if (error) { toast({ title: 'Khalad', description: error.message, variant: 'destructive' }); return false }
    toast({ title: 'La cusboonaysiiyay' })
    load()
    return true
  }

  const handleLogoFile = (file: File) => {
    if (file.size > 500 * 1024) {
      toast({ title: 'Sawirka aad buu u weyn yahay', description: 'Max 500KB', variant: 'destructive' })
      return
    }
    setUploading(true)
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setLogoUrl(dataUrl) // instant preview
      setUploading(false)
    }
    reader.readAsDataURL(file)
  }

  const recordPayment = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    try {
      const { data, error } = await supabase.functions.invoke('platform-record-payment', {
        body: { tenant_id: id, ...payForm },
      })
      if (error || (data as any)?.error) throw new Error((data as any)?.error ?? error?.message)
      toast({ title: '✅ Lacag waa la qoray' })
      setPayForm({ amount: 0, payment_method: 'EVC', period_days: 30, notes: '' })
      load()
    } catch (e: any) {
      toast({ title: 'Khalad', description: e.message, variant: 'destructive' })
    } finally { setSaving(false) }
  }

  if (loading || !tenant) {
    return <div className="p-8 flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>
  }

  const brandingDirty =
    name !== (tenant.name ?? '') ||
    primary !== (tenant.primary_color ?? '') ||
    accent !== ((tenant as any).accent_color ?? '') ||
    logoUrl !== (tenant.logo_url ?? null)

  const saveBranding = async () => {
    await update({
      name: name.trim() || tenant.name,
      primary_color: primary.trim() || null,
      accent_color: accent.trim() || null,
      logo_url: logoUrl,
    })
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <Button asChild variant="ghost" size="sm">
        <Link to="/admin/resellers"><ArrowLeft className="h-4 w-4 mr-1" /> Dib u noqo</Link>
      </Button>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{tenant.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-muted-foreground font-mono">
              iftinagents.com/t/{tenant.slug}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => {
                navigator.clipboard.writeText(`https://iftinagents.com/t/${tenant.slug}`)
              }}
            >
              Copy link
            </Button>
          </div>
          <a
            href={`/t/${tenant.slug}/providers`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary underline mt-1 inline-block"
          >
            Fur app-ka reseller-kan →
          </a>
        </div>

        <Badge>{tenant.status}</Badge>
      </div>


      {/* Live theme preview */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Theme Preview (live)</CardTitle>
          {brandingDirty && (
            <Button size="sm" onClick={saveBranding} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Keydi isbeddelka
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <ThemePreview name={name} logoUrl={logoUrl} primary={primary} accent={accent} />
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Branding</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Magaca</Label>
              <Input value={name} onChange={e => setName(e.target.value)} />
            </div>

            <div>
              <Label>Logo</Label>
              <div className="flex items-center gap-3 mt-1">
                <div className="h-14 w-14 rounded-lg border bg-white grid place-items-center overflow-hidden">
                  {logoUrl ? (
                    <CachedImage src={logoUrl} alt={`${name || 'Reseller'} logo`} className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-xs text-muted-foreground">none</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm"
                    onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading
                      ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      : <Upload className="h-4 w-4 mr-1" />}
                    Upload
                  </Button>
                  {logoUrl && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setLogoUrl(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); e.target.value = '' }} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">PNG/JPG/SVG · max 500KB</p>
              <Input className="mt-2" placeholder="Ama geli URL: https://..."
                value={logoUrl?.startsWith('data:') ? '' : (logoUrl ?? '')}
                onChange={e => setLogoUrl(e.target.value || null)} />
            </div>

            <ColorField label="Primary color" value={primary} onChange={setPrimary}
              placeholder="#3D0066 ama 276 100% 20%" />

            <ColorField label="Accent color" value={accent} onChange={setAccent}
              placeholder="#C5F82A ama 76 94% 57%" />

            <div className="flex gap-2 pt-2 border-t flex-wrap">
              {tenant.status !== 'active' && (
                <Button size="sm" onClick={() => update({ status: 'active' })} disabled={saving}>
                  Activate
                </Button>
              )}
              {tenant.status === 'active' && (
                <Button size="sm" variant="destructive"
                  onClick={() => update({ status: 'suspended' })} disabled={saving}>
                  Suspend
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={resetPassword} disabled={resetting}>
                {resetting
                  ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  : <KeyRound className="h-4 w-4 mr-1" />}
                Generate Password
              </Button>
              <Button size="sm" variant="secondary" onClick={impersonate} disabled={impersonating}>
                {impersonating
                  ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  : <UserCog className="h-4 w-4 mr-1" />}
                Impersonate
              </Button>
              <div className="flex-1" />
              <select className="h-9 rounded-md border bg-background px-3 text-sm"
                value={tenant.plan_id ?? ''}
                onChange={e => update({ plan_id: e.target.value })}>
                {plans.map(p => (
                  <option key={p.id} value={p.id}>{p.name} — ${p.price_monthly}</option>
                ))}
              </select>
            </div>

            {newCreds && (
              <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase">
                  Password cusub — copy garee hadda
                </div>
                <div className="font-mono text-sm">
                  <div><span className="text-muted-foreground">Email:</span> {newCreds.email}</div>
                  <div><span className="text-muted-foreground">Password:</span> <span className="font-bold">{newCreds.password}</span></div>
                </div>
                <Button size="sm" variant="outline" onClick={copyCreds}>
                  {copied
                    ? <><Check className="h-4 w-4 mr-1" /> La copy gareeyay</>
                    : <><Copy className="h-4 w-4 mr-1" /> Copy</>}
                </Button>
                <p className="text-xs text-amber-600">
                  ⚠️ Markaad page-ka ka tagto password-kan mar dambe lama tusi doono.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Qor lacag-bixin</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={recordPayment} className="space-y-3">
              <div>
                <Label>Amount ($)</Label>
                <Input type="number" required min={0} step="0.01"
                  value={payForm.amount}
                  onChange={e => setPayForm({ ...payForm, amount: +e.target.value })} />
              </div>
              <div>
                <Label>Habka bixinta</Label>
                <Input value={payForm.payment_method}
                  onChange={e => setPayForm({ ...payForm, payment_method: e.target.value })} />
              </div>
              <div>
                <Label>Period (maalmood)</Label>
                <Input type="number" min={1} value={payForm.period_days}
                  onChange={e => setPayForm({ ...payForm, period_days: +e.target.value })} />
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={payForm.notes}
                  onChange={e => setPayForm({ ...payForm, notes: e.target.value })} />
              </div>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Qor & kordhi period
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Taariikhda Lacagaha</CardTitle></CardHeader>
        <CardContent>
          {payments.length === 0
            ? <p className="text-sm text-muted-foreground">Wax lacag ah weli lama qorin.</p>
            : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="py-2">Paid</th><th>Amount</th><th>Method</th><th>Period</th><th>Notes</th></tr>
                </thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id} className="border-t">
                      <td className="py-2">{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : '—'}</td>
                      <td>${p.amount}</td>
                      <td>{p.payment_method}</td>
                      <td className="text-xs">
                        {p.period_start && p.period_end
                          ? `${new Date(p.period_start).toLocaleDateString()} → ${new Date(p.period_end).toLocaleDateString()}`
                          : '—'}
                      </td>
                      <td className="text-xs">{p.notes ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </CardContent>
      </Card>

      {tenant && <PartnerApiTab tenant={tenant} onRefresh={load} />}

    </div>
  )
}

function ColorField({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  // Show a live swatch as the user types
  const swatch = value.trim()
    ? (value.trim().startsWith('#') ? value.trim() : `hsl(${value.trim()})`)
    : 'transparent'
  const isHex = value.trim().startsWith('#')
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex gap-2 items-center mt-1">
        <div className="h-10 w-10 rounded border shrink-0"
          style={{ background: swatch }} />
        {/* Native color picker for hex */}
        <input
          type="color"
          value={isHex && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : '#3d0066'}
          onChange={e => onChange(e.target.value)}
          className="h-10 w-10 rounded border cursor-pointer bg-transparent shrink-0"
          aria-label={`${label} picker`}
        />
        <Input value={value} placeholder={placeholder}
          onChange={e => onChange(e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Geli HEX (<code>#3D0066</code>) ama HSL (<code>276 100% 20%</code>).
      </p>
    </div>
  )
}
