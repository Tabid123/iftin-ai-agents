import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { NavLink, Outlet, useNavigate } from "@/lib/router-compat"
import { Button } from '@/components/ui/button'
import { Loader2, LogOut, Users, Package, BarChart3, Settings } from 'lucide-react'
import PlatformAuth from './PlatformAuth'
import iftinLogo from '@/assets/iftin-agents-logo.png'

export default function PlatformLayout() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [authed, setAuthed] = useState(false)
  const [isSuper, setIsSuper] = useState(false)
  const [email, setEmail] = useState<string>('')

  useEffect(() => {
    let mounted = true
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!mounted) return
      if (!session) {
        setAuthed(false); setLoading(false); return
      }
      setAuthed(true); setEmail(session.user.email ?? '')
      const { data: roles } = await supabase
        .from('user_roles').select('role').eq('user_id', session.user.id)
      const sa = (roles ?? []).some((r: any) => r.role === 'super_admin')
      setIsSuper(sa); setLoading(false)
    }
    check()
    const { data: sub } = supabase.auth.onAuthStateChange(() => check())
    return () => { mounted = false; sub.subscription.unsubscribe() }
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!authed || !isSuper) {
    return <PlatformAuth onSuccess={() => window.location.reload()} authed={authed} />
  }

  const navItems = [
    { to: '/admin', label: 'Overview', icon: BarChart3, end: true },
    { to: '/admin/resellers', label: 'Resellers', icon: Users },
    { to: '/admin/plans', label: 'Plans', icon: Package },
  ]

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-60 border-r bg-card flex flex-col">
        <div className="px-5 py-4 border-b flex items-center gap-3">
          <img src={iftinLogo} alt="Iftin Agents" className="h-10 w-10 object-contain" />
          <div>
            <div className="text-xs uppercase text-muted-foreground">Admin</div>
            <div className="text-base font-bold leading-tight">Iftin Agents</div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
                  isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t space-y-2">
          <div className="text-xs text-muted-foreground truncate">{email}</div>
          <Button
            variant="outline" size="sm" className="w-full"
            onClick={async () => { await supabase.auth.signOut(); navigate(0) }}
          >
            <LogOut className="h-4 w-4 mr-1" /> Ka bax
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
