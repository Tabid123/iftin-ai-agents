import { useState } from 'react';
import { useNavigate } from "@/lib/router-compat";
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Shield, Loader2, AlertTriangle, KeyRound } from 'lucide-react';
import najaxLogo from '@/assets/najax-logo.jpeg';

// TEMPORARY EMERGENCY BYPASS
const EMERGENCY_PIN = '5516';

const AdminLogin = () => {
  const navigate = useNavigate();
  const tenantState = useTenant();
  const tenant = tenantState.status === 'ready' || tenantState.status === 'suspended' ? tenantState.tenant : null;
  const brandName = tenant?.name || 'Admin';
  const brandLogo = tenant?.logo_url || najaxLogo;
  const primary = tenant?.primary_color || '#3D0066';
  const accent = tenant?.accent_color || '#C5F82A';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showEmergencyMode, setShowEmergencyMode] = useState(false);
  const [emergencyPin, setEmergencyPin] = useState('');

  const isServiceRestricted = (errorMsg: string) => {
    return errorMsg.toLowerCase().includes('restricted') ||
           errorMsg.toLowerCase().includes('quota') ||
           errorMsg.toLowerCase().includes('exceeded') ||
           errorMsg.toLowerCase().includes('fetch') ||
           errorMsg.toLowerCase().includes('network') ||
           errorMsg.toLowerCase().includes('failed to fetch');
  };

  const handleEmergencyLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMERGENCY_PIN) {
      toast({ title: 'Khalad', description: 'Emergency PIN lama helin', variant: 'destructive' });
      return;
    }
    if (emergencyPin === EMERGENCY_PIN) {
      // TEMPORARY local session - Supabase xiran yahay
      localStorage.setItem('adminEmergencySession', 'true');
      localStorage.setItem('adminEmergencyTime', Date.now().toString());
      toast({ title: '✅ Guul', description: 'Emergency mode: Admin waa la soo galay' });
      navigate('/dashboard');
    } else {
      toast({ title: 'Khalad PIN', description: 'PIN-ka waa khalad', variant: 'destructive' });
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast({
        title: 'Khalad',
        description: 'Gali email iyo password',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Hubi haddii Supabase xiran yahay (quota/restricted error)
        if (isServiceRestricted(error.message)) {
          setShowEmergencyMode(true);
          toast({
            title: '⚠️ Supabase Xiran',
            description: 'Service waa xiran. Emergency mode isticmaal.',
            variant: 'destructive',
          });
          setLoading(false);
          return;
        }
        throw error;
      }

      // Check if user is a tenant member (reseller owner/admin) OR a platform admin
      const [{ data: tenantMember }, { data: roleData }] = await Promise.all([
        supabase
          .from('tenant_members')
          .select('tenant_id, role')
          .eq('user_id', data.user.id)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', data.user.id)
          .in('role', ['admin', 'super_admin'])
          .limit(1)
          .maybeSingle(),
      ]);

      if (!tenantMember && !roleData) {
        await supabase.auth.signOut();
        toast({
          title: 'Ma lihid fasax',
          description: 'Admin ama reseller owner kaliya ayaa geli kara',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      // Tenant isolation: reseller-ka waa inuu galo subdomain-ka tenant-kiisa kaliya.
      const isSuperAdmin = roleData?.role === 'super_admin';
      if (!isSuperAdmin && tenantMember && tenant && tenantMember.tenant_id !== tenant.id) {
        await supabase.auth.signOut();
        toast({
          title: 'Subdomain khalad',
          description: `Akoonkaagu ma aha kan ${tenant.name}. Fadlan isticmaal subdomain-ka reseller-kaaga.`,
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }


      toast({
        title: 'Guul',
        description: 'Waad soo gashay',
      });

      navigate('/dashboard');

    } catch (error: any) {
      // Haddii connection-ka oo dhan fashilmo (network error)
      if (isServiceRestricted(error.message || '')) {
        setShowEmergencyMode(true);
        toast({
          title: '⚠️ Supabase Xiran',
          description: 'Service ma heli karo. Emergency mode isticmaal.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Khalad',
          description: error.message || 'Wax khalad ah ayaa dhacay',
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: `linear-gradient(135deg, ${primary}20 0%, hsl(var(--background)) 50%, ${accent}20 100%)`,
      }}
    >
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <div
            className="w-20 h-20 mx-auto rounded-2xl overflow-hidden flex items-center justify-center"
            style={{ backgroundColor: tenant?.logo_url ? 'transparent' : primary }}
          >
            <img
              src={brandLogo}
              alt={`${brandName} Logo`}
              className="w-full h-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = najaxLogo; }}
            />
          </div>
          <div className="flex items-center justify-center gap-2">
            <Shield className="h-6 w-6" style={{ color: primary }} />
            <CardTitle className="text-2xl">{brandName} Admin</CardTitle>
          </div>
          <CardDescription className="text-center">
            Gal admin dashboard-ka
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Normal login form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full text-white" disabled={loading} style={{ backgroundColor: primary }}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Fadlan sug...
                </>
              ) : (
                'Gal'
              )}
            </Button>
          </form>

          {/* Emergency Mode - Supabase xiran yahay */}
          {showEmergencyMode && (
            <div className="border border-destructive/50 rounded-lg p-4 bg-destructive/5 space-y-3">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-semibold text-sm">Emergency Mode - Supabase Xiran</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Supabase service-ku ma shaqaynayso (quota exceeded). PIN-ka gaar ah ku gal si aad ugu geshid dashboard-ka.
              </p>
              <form onSubmit={handleEmergencyLogin} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="emergency-pin" className="flex items-center gap-1">
                    <KeyRound className="h-4 w-4" />
                    Emergency PIN
                  </Label>
                  <Input
                    id="emergency-pin"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="PIN gali"
                    value={emergencyPin}
                    onChange={(e) => setEmergencyPin(e.target.value)}
                    required
                    className="border-destructive/50"
                  />
                </div>
                <Button type="submit" variant="destructive" className="w-full">
                  <KeyRound className="mr-2 h-4 w-4" />
                  Emergency Gal
                </Button>
              </form>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLogin;
