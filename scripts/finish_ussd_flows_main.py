from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing marker: {label}")
    return text.replace(old, new, 1)


# DataPackages
p = Path("src/components/pages/DataPackages.tsx")
s = p.read_text()
s = replace_once(s, "import { buildPaymentUssd, formatUssdAmount, fetchIftinCatalog, hasCatalog, isOrderingBlocked, mapProviders, mapCategories, mapPackages, mapPaymentProviders } from '@/lib/iftinCatalog';\n", "import { buildPaymentUssd, formatUssdAmount, fetchIftinCatalog, hasCatalog, isOrderingBlocked, mapProviders, mapCategories, mapPackages, mapPaymentProviders } from '@/lib/iftinCatalog';\nimport UssdDiscoveryDialog, { type DiscoveryChoice } from '@/components/UssdDiscoveryDialog';\n", "DataPackages import")
s = replace_once(s, "  const [ussdCopied, setUssdCopied] = useState(false);\n  const { queueOrder } = useOfflineSync();", "  const [ussdCopied, setUssdCopied] = useState(false);\n  const [discoveryRootPackage, setDiscoveryRootPackage] = useState<any | null>(null);\n  const { queueOrder } = useOfflineSync();", "DataPackages discovery state")
marker = "  const { data: promotionalTextData } = useQuery({"
discovery_query = """  const resolvedProviderId = (() => {
    if (provider?.includes('-')) return provider;
    const fromPackages = packages.find((p: any) => p?.provider_id)?.provider_id;
    if (fromPackages) return fromPackages;
    try {
      const cachedProviders = JSON.parse(localStorage.getItem('offline_providers') || '[]');
      return cachedProviders.find((p: any) =>
        p.id === provider || p.provider_name?.toLowerCase() === provider?.toLowerCase()
      )?.id || '';
    } catch {
      return '';
    }
  })();

  const { data: discoveryRootIds = [] } = useQuery({
    queryKey: ['discoveryRootIds', resolvedProviderId],
    queryFn: async () => {
      if (!resolvedProviderId || isReallyOnline !== true) return [];
      const { data, error } = await (supabase as any).rpc('get_discovery_root_ids', {
        p_provider_id: resolvedProviderId,
      });
      if (error) {
        console.warn('Discovery roots unavailable:', error.message);
        return [];
      }
      return (data || []).map((row: any) => String(row.package_id));
    },
    enabled: !!resolvedProviderId && isReallyOnline === true,
    staleTime: 5 * 60 * 1000,
    retry: false,
    initialData: [],
  });

"""
s = replace_once(s, marker, discovery_query + marker, "DataPackages roots query")
old_purchase = """  const handlePurchase = (packageData: any) => {
    // Iftin credit limit reached → ordering is blocked in the UI
    if (isOrderingBlocked()) {
      toast({
        title: 'Dalab lama sameyn karo',
        description: 'Xadka deynta (credit limit) waa la gaaray. Fadlan bixi fatuuradda.',
        variant: 'destructive',
      });
      return;
    }
    // Get category name for this package
    const packageCategory = categories.find(c => c.id === packageData.categoryId);
    const categoryName = packageCategory?.category_name || '';
    
    // If offline mode, show confirmation directly
    if (isOffline) {
      setSelectedPackageData(packageData);
      setShowConfirmationScreen(true);
    } else {
      // Online mode: go to payment providers page
      navigate(`/payment/${provider}`, { 
        state: { 
          package: packageData, 
          providerName,
          categoryName // Pass category name for ADSL detection
        } 
      });
    }
  };
"""
new_purchase = """  const handlePurchase = (packageData: any) => {
    if (isOrderingBlocked()) {
      toast({
        title: 'Dalab lama sameyn karo',
        description: 'Xadka deynta (credit limit) waa la gaaray. Fadlan bixi fatuuradda.',
        variant: 'destructive',
      });
      return;
    }

    const isDiscoveryRoot = discoveryRootIds.includes(String(packageData.id));
    if (isDiscoveryRoot) {
      if (isReallyOnline !== true || isOffline) {
        toast({
          title: 'Internet ayaa loo baahan yahay',
          description: 'Xirmadan *212* waxay u baahan tahay raadinta live-ka ah ka hor lacag bixinta.',
          variant: 'destructive',
        });
        return;
      }
      const rawPackage = packages.find((p: any) => p.id === packageData.id);
      setDiscoveryRootPackage({ ...rawPackage, ...packageData, providerId: packageData.providerId || rawPackage?.provider_id || resolvedProviderId });
      return;
    }

    const packageCategory = categories.find(c => c.id === packageData.categoryId);
    const categoryName = packageCategory?.category_name || '';
    if (isOffline) {
      setSelectedPackageData(packageData);
      setShowConfirmationScreen(true);
    } else {
      navigate(`/payment/${provider}`, { state: { package: packageData, providerName, categoryName } });
    }
  };

  const handleDiscoverySelect = (choice: DiscoveryChoice, discoveredReceiver: string, discoveryId: string) => {
    if (!discoveryRootPackage || choice.selling_price == null) return;
    const packageCategory = categories.find(c => c.id === discoveryRootPackage.categoryId);
    const categoryName = packageCategory?.category_name || '';
    const carrierLabel = choice.carrier_label || choice.label;
    const dynamicPackage = {
      id: discoveryRootPackage.id,
      providerId: discoveryRootPackage.providerId || discoveryRootPackage.provider_id || resolvedProviderId,
      categoryId: discoveryRootPackage.categoryId || discoveryRootPackage.category_id || null,
      name: choice.label,
      price: `$${Number(choice.selling_price).toFixed(2)}`,
      costPrice: Number(discoveryRootPackage.costPrice ?? discoveryRootPackage.cost_price ?? 0),
      data: choice.info_line1 || choice.label,
      validity: choice.info_line2 || choice.label,
      ussdCode: discoveryRootPackage.ussdCode || discoveryRootPackage.ussd_code || null,
    };
    setDiscoveryRootPackage(null);
    navigate(`/payment/${provider}`, {
      state: { package: dynamicPackage, providerName, categoryName, discoveryId, discoveryLabel: carrierLabel, discoveryReceiverPhone: discoveredReceiver, discoveryRootId: discoveryRootPackage.id },
    });
  };
"""
s = replace_once(s, old_purchase, new_purchase, "DataPackages handlePurchase")
s = replace_once(s, "providerId: provider,\n                categoryId:", "providerId: pkg.provider_id || resolvedProviderId || provider,\n                categoryId:", "DataPackages provider id")
dialog = """      <UssdDiscoveryDialog
        open={!!discoveryRootPackage}
        rootPackage={discoveryRootPackage}
        providerName={providerName}
        onClose={() => setDiscoveryRootPackage(null)}
        onSelect={handleDiscoverySelect}
      />

"""
s = replace_once(s, "      {/* Offline Confirmation Screen */}\n", dialog + "      {/* Offline Confirmation Screen */}\n", "DataPackages dialog")
p.write_text(s)

# PaymentProviders
p = Path("src/components/pages/PaymentProviders.tsx")
s = p.read_text()
s = replace_once(s, "  const categoryName = location.state?.categoryName || '';\n", "  const categoryName = location.state?.categoryName || '';\n  const discoveryId = location.state?.discoveryId || '';\n  const discoveryLabel = location.state?.discoveryLabel || '';\n  const discoveryReceiverPhone = location.state?.discoveryReceiverPhone || '';\n", "Payment discovery state")
old_effect = """  React.useEffect(() => {
    if (!providerName) return;
    if (isADSL) {
      setReceiverProviderPrefix('1');
      setReceiverNumber('1');
    } else {
      const prefix = getProviderPrefix(providerName);
      setReceiverProviderPrefix(prefix);
      setReceiverNumber(prefix);
    }
  }, [providerName, isADSL, getProviderPrefix]);
"""
new_effect = """  React.useEffect(() => {
    if (discoveryId && discoveryReceiverPhone) {
      const clean = String(discoveryReceiverPhone).replace(/\\D/g, '').replace(/^252/, '').replace(/^0/, '').slice(-9);
      setReceiverProviderPrefix(clean.slice(0, 2));
      setReceiverNumber(clean);
      setReceiverNumberError('');
      return;
    }
    if (!providerName) return;
    if (isADSL) {
      setReceiverProviderPrefix('1');
      setReceiverNumber('1');
    } else {
      const prefix = getProviderPrefix(providerName);
      setReceiverProviderPrefix(prefix);
      setReceiverNumber(prefix);
    }
  }, [providerName, isADSL, getProviderPrefix, discoveryId, discoveryReceiverPhone]);
"""
s = replace_once(s, old_effect, new_effect, "Payment receiver init")
s = replace_once(s, "  const handleReceiverNumberChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {\n    const value = e.target.value.replace(/\\D/g, '');", "  const handleReceiverNumberChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {\n    if (discoveryId) return;\n    const value = e.target.value.replace(/\\D/g, '');", "Payment receiver lock")
s = replace_once(s, "  }, [providerName, isADSL]);\n\n  const handleProceedToPayment", "  }, [providerName, isADSL, discoveryId]);\n\n  const handleProceedToPayment", "Payment receiver callback deps")
s = replace_once(s, "      try {\n        const created = await createIftinIntent({", "      if (!discoveryId) {\n        try {\n        const created = await createIftinIntent({", "Payment bypass intent start")
catch_tail = """        if (!iftinNotConfigured) {
          setIsProcessingPayment(false);
          setShowConfirmationScreen(false);
          setErrorType('general');
          setErrorMessage(intentError?.message || 'Iftin API-ga wuu diiday dalabka.');
          setShowErrorModal(true);
          return;
        }
      }

      const pendingPaymentData = {"""
catch_new = catch_tail.replace("      }\n\n      const pendingPaymentData", "      }\n      }\n\n      const pendingPaymentData")
s = replace_once(s, catch_tail, catch_new, "Payment bypass intent end")
s = replace_once(s, "        expected_amount: parseFloat(amount),\n        status: 'pending'\n      };", "        expected_amount: parseFloat(amount),\n        discovery_id: discoveryId || null,\n        discovery_label: discoveryLabel || null,\n        status: 'pending'\n      };", "Payment pending discovery metadata")
old_dedup = """      const { data: existingPending } = await supabase
        .from('pending_online_payments')
        .select('id')
        .eq('sender_phone', cleanCustomerPaymentPhone)
        .eq('expected_amount', parseFloat(amount))
        .eq('status', 'pending')
        .gte('created_at', tenMinutesAgo)
        .limit(1);
"""
new_dedup = """      let existingPendingQuery: any = supabase
        .from('pending_online_payments')
        .select('id')
        .eq('sender_phone', cleanCustomerPaymentPhone)
        .eq('receiver_phone', receiverNumber)
        .eq('package_id', packageData?.id)
        .eq('expected_amount', parseFloat(amount))
        .eq('status', 'pending')
        .gte('created_at', tenMinutesAgo);
      if (discoveryId) existingPendingQuery = existingPendingQuery.eq('discovery_id', discoveryId);
      const { data: existingPending } = await existingPendingQuery.limit(1);
"""
s = replace_once(s, old_dedup, new_dedup, "Payment dedup")
s = replace_once(s, "value={receiverNumber} onChange={handleReceiverNumberChange}", "value={receiverNumber} onChange={handleReceiverNumberChange} readOnly={!!discoveryId}", "Payment receiver readonly")
p.write_text(s)

# process-payment-receipt
p = Path("supabase/functions/process-payment-receipt/index.ts")
s = p.read_text()
old_sanitize = """function sanitizeUssdCode(ussd: string): string {
  let cleaned = (ussd || '').replace(/\\s+/g, '').trim();
  cleaned = cleaned.replace(/^(\\*\\d+?)(\\d{9})(\\*)/, '$1*$2$3');
  cleaned = cleaned.replace(/\\*{2,}/g, '*');
  if (cleaned && !cleaned.endsWith('#')) cleaned += '#';
  return cleaned;
}"""
new_sanitize = """function sanitizeUssdCode(ussd: string): string {
  const [rawDial, ...metadataParts] = (ussd || '').split('|');
  let cleaned = (rawDial || '').replace(/\\s+/g, '').trim();
  cleaned = cleaned.replace(/^(\\*\\d+?)(\\d{9})(\\*)/, '$1*$2$3');
  cleaned = cleaned.replace(/\\*{2,}/g, '*');
  if (cleaned && !cleaned.endsWith('#')) cleaned += '#';
  const metadata = metadataParts.join('|').trim();
  return metadata ? `${cleaned}|${metadata}` : cleaned;
}"""
s = replace_once(s, old_sanitize, new_sanitize, "Receipt sanitizer")
receipt_marker = """        await supabase.from('payment_receipts').update({
          status: 'matched',
          matched_order_id: newOrder.id,
          matching_strategy: 'pending_online_payment',
          processed_at: new Date().toISOString(),
          admin_notes: `Route: ${route} | ${packageData?.package_name} for ${pendingOnline.receiver_phone} | SIM: ${resolvedSimNumber}`
        }).eq('id', receipt.id);

        const instruction = await getDeliveryInstruction(supabase, pendingOnline.provider_id, pendingOnline.package_id, packageData?.category_id);
"""
receipt_new = """        await supabase.from('payment_receipts').update({
          status: 'matched',
          matched_order_id: newOrder.id,
          matching_strategy: (newOrder as any).discovery_id ? 'pending_online_discovery' : 'pending_online_payment',
          processed_at: new Date().toISOString(),
          admin_notes: `Route: ${route} | ${packageData?.package_name} for ${pendingOnline.receiver_phone} | SIM: ${resolvedSimNumber}`
        }).eq('id', receipt.id);

        if ((newOrder as any).discovery_id) {
          console.log('📡 *212* discovery order attached; held-session resume/redial is handled by DB trigger:', (newOrder as any).discovery_id);
          return new Response(
            JSON.stringify({ success: true, message: 'Pending online discovery payment matched', order_id: newOrder.id, matching_strategy: 'pending_online_discovery', route }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          );
        }

        const instruction = await getDeliveryInstruction(supabase, pendingOnline.provider_id, pendingOnline.package_id, packageData?.category_id);
"""
s = replace_once(s, receipt_marker, receipt_new, "Receipt discovery return")
p.write_text(s)

# activate-package
p = Path("supabase/functions/activate-package/index.ts")
s = p.read_text()
old = """      const sanitizeUssdCode = (ussdCode: string) => {
        let cleaned = (ussdCode || '').replace(/\\s+/g, '').trim();
        cleaned = cleaned.replace(/^(\\*\\d+?)(\\d{9})(\\*)/, '$1*$2$3');
        cleaned = cleaned.replace(/\\*{2,}/g, '*');
        if (cleaned && !cleaned.endsWith('#')) {
          cleaned += '#';
        }
        return cleaned;
      };"""
new = """      const sanitizeUssdCode = (ussdCode: string) => {
        const [rawDial, ...metadataParts] = (ussdCode || '').split('|');
        let cleaned = (rawDial || '').replace(/\\s+/g, '').trim();
        cleaned = cleaned.replace(/^(\\*\\d+?)(\\d{9})(\\*)/, '$1*$2$3');
        cleaned = cleaned.replace(/\\*{2,}/g, '*');
        if (cleaned && !cleaned.endsWith('#')) {
          cleaned += '#';
        }
        const metadata = metadataParts.join('|').trim();
        return metadata ? `${cleaned}|${metadata}` : cleaned;
      };"""
s = replace_once(s, old, new, "Activate sanitizer")
p.write_text(s)

print("Final USSD integration changes applied")
