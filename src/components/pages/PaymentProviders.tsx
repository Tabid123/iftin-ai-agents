import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from "@/lib/router-compat";
import { ArrowLeft, Check, Zap, Clock, Smartphone, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { PaymentErrorModal } from '@/components/PaymentErrorModal';
import { PaymentLoadingOverlay } from '@/components/PaymentLoadingOverlay';
import OfflinePhoneInputSheet from '@/components/OfflinePhoneInputSheet';
import somaliaFlag from '@/assets/somalia-flag.png';
import hormuudLogo from '@/assets/providers/hormuud-logo.jpeg';
import somtelLogo from '@/assets/providers/somtel-logo.jpg';
import somnetLogo from '@/assets/providers/somnet-logo.png';
import somlinkLogo from '@/assets/providers/somlink-logo.png';
import amtelLogo from '@/assets/providers/amtel-logo.png';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useConnectivity } from '@/contexts/ConnectivityContext';
import { buildPaymentUssd, fetchIftinCatalog, hasCatalog, isOrderingBlocked, mapPaymentProviders } from '@/lib/iftinCatalog';
import {
  createIftinIntent,
  fetchIftinIntentStatus,
  isIntentPending,
  IftinIntentError,
  type IftinIntent,
} from '@/lib/iftinIntent';
import { Capacitor } from '@capacitor/core';
import { getAllowedPrefixes, matchesAllowedPrefix, formatPrefixes } from '@/lib/phonePrefixes';
interface PaymentProvider {
  id: string;
  provider_name: string;
  provider_logo: string | null;
  commission_rate: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  prefix_code: string | null;
  ussd_code_template: string | null;
  payment_number: string | null;
}
const PaymentProviders = () => {
  const navigate = useNavigate();
  const { isReallyOnline } = useConnectivity();
  const { queueOrder } = useOfflineSync();
  const queryClient = useQueryClient();
  const {
    provider
  } = useParams<{
    provider: string;
  }>();
  const location = useLocation();
  const packageData = location.state?.package;
  const providerName = location.state?.providerName;
  const categoryName = location.state?.categoryName || '';
  
  // Helper function to detect ADSL packages
  const isADSLPackage = (catName: string) => {
    return catName?.toUpperCase().includes('ADSL');
  };
  
  const isADSL = isADSLPackage(categoryName);
  const {
    data: paymentProviders = [],
    isLoading
  } = useQuery({
    queryKey: ['paymentProviders'],
    queryFn: async () => {
      // Try cache first if offline
      if (!isReallyOnline) {
        const cached = localStorage.getItem('offline_payment_providers');
        return cached ? JSON.parse(cached) : [];
      }
      
      const readCache = () => {
        try {
          const cached = localStorage.getItem('offline_payment_providers');
          const parsed = cached ? JSON.parse(cached) : [];
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      };

      const catalog = await fetchIftinCatalog();
      if (hasCatalog(catalog)) {
        const fromIftin = mapPaymentProviders(catalog!);
        // Iftin sometimes returns a catalog without payment providers; keep the
        // last known list instead of showing an empty payment screen.
        if (fromIftin.length) {
          localStorage.setItem('offline_payment_providers', JSON.stringify(fromIftin));
          return fromIftin;
        }
        const cached = readCache();
        if (cached.length) return cached;
      }

      const {
        data,
        error
      } = await (supabase as any).rpc('get_active_payment_providers');
      if (error) {
        // Never blank the payment screen because of a transient error.
        const cached = readCache();
        if (cached.length) return cached;
        throw error;
      }

      // An empty local table must NOT wipe the Iftin list we already have.
      if (Array.isArray(data) && data.length) {
        localStorage.setItem('offline_payment_providers', JSON.stringify(data));
        return data;
      }

      return readCache();

    },
    staleTime: 30000, // 30 seconds
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: 1,
    initialData: () => {
      try {
        const cached = localStorage.getItem('offline_payment_providers');
        return cached ? JSON.parse(cached) : undefined;
      } catch (e) {
        return undefined;
      }
    },
  });

  // Fixed display order: EVC, Jeeb, e-Dahab — anything else keeps its own order after these.
  const orderedPaymentProviders = useMemo(() => {
    const rank = (name: string) => {
      const n = (name || '').toLowerCase().replace(/[^a-z]/g, '');
      if (n.includes('evc')) return 0;
      if (n.includes('jeeb') || n.includes('jeep')) return 1;
      if (n.includes('edahab') || n.includes('dahab')) return 2;
      return 3;
    };
    return [...paymentProviders].sort(
      (a: any, b: any) => rank(a?.provider_name) - rank(b?.provider_name)
    );
  }, [paymentProviders]);



  // Realtime subscription for payment providers changes
  useEffect(() => {
    const channel = supabase
      .channel('payment-providers-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payment_providers_config' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['paymentProviders'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Fetch delivery instructions for the package's category
  const {
    data: deliveryInstructions = []
  } = useQuery({
    queryKey: ['deliveryInstructions', packageData?.categoryId, packageData?.providerId],
    queryFn: async () => {
      if (!packageData?.categoryId && !packageData?.providerId) return [];
      
      // Try cache first if offline
      if (!isReallyOnline) {
        const cached = localStorage.getItem('offline_delivery_instructions');
        if (cached) {
          const allInstructions = JSON.parse(cached);
          return allInstructions.filter((inst: any) => inst.provider_id === packageData.providerId);
        }
        return [];
      }
      
      const { data: all, error } = await (supabase as any).rpc('get_tenant_delivery_instructions');
      if (error) throw error;
      return (all || []).filter((inst: any) => inst.provider_id === packageData.providerId);
    },
    enabled: !!(packageData?.categoryId || packageData?.providerId),
    staleTime: 5 * 60 * 1000,
    retry: false,
    initialData: () => {
      try {
        if (!packageData?.providerId) return [];
        const cached = localStorage.getItem('offline_delivery_instructions');
        if (cached) {
          const allInstructions = JSON.parse(cached);
          return allInstructions.filter((inst: any) => inst.provider_id === packageData.providerId);
        }
      } catch (e) {}
      return [];
    },
  });

  const [selectedProvider, setSelectedProvider] = useState('');
  const [paymentNumber, setPaymentNumber] = useState('');
  const [receiverNumber, setReceiverNumber] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showConfirmationScreen, setShowConfirmationScreen] = useState(false);
  const [paymentProviderPrefix, setPaymentProviderPrefix] = useState('');
  const [receiverProviderPrefix, setReceiverProviderPrefix] = useState('');
  const [receiverNumberError, setReceiverNumberError] = useState('');
  const [paymentNumberError, setPaymentNumberError] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorType, setErrorType] = useState<'insufficient_balance' | 'user_cancelled' | 'timeout' | 'wrong_pin' | 'general'>('general');
  const [errorMessage, setErrorMessage] = useState('');
  const [showOfflineSheet, setShowOfflineSheet] = useState(false);
  const isOfflineFromState = location.state?.isOffline;
  const [ussdCodeForDisplay, setUssdCodeForDisplay] = useState<string>('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  // Iftin Prepaid Intent (device-less): Iftin qaadata lacagta, SMS-ka isku
  // xaqiijisa oo isla markiiba xirmada gaarsiisa.
  const [intent, setIntent] = useState<IftinIntent | null>(null);
  const [intentState, setIntentState] = useState<string>('pending');
  const [intentNotes, setIntentNotes] = useState<string | null>(null);
  // Lacagta la diraayo waa sell price-ka reseller-ka (ma aha base price-ka Iftin).
  const [intentSellPrice, setIntentSellPrice] = useState<number>(0);
  const [intentUssd, setIntentUssd] = useState<string | null>(null);

  /** Beddel qaybta lacagta ee USSD-ka Iftin si loo isticmaalo sell price-ka. */
  const applySellPriceToUssd = (ussd: string | null, sellPrice: number): string | null => {
    if (!ussd) return ussd;
    const parts = ussd.replace(/#$/, '').split('*');
    const last = parts[parts.length - 1];
    if (!/^\d+$/.test(last)) return ussd;
    const cents = Math.round(sellPrice * 100);
    parts[parts.length - 1] = String(cents).padStart(Math.max(last.length, 3), '0');
    return `${parts.join('*')}#`;
  };

  const getProviderFromPrefix = useCallback((phoneNumber: string) => {
    const prefix = phoneNumber.substring(0, 2);
    const firstChar = phoneNumber.substring(0, 1);
    
    // ADSL numbers start with '1' - they are Hormuud
    if (firstChar === '1' && phoneNumber.length === 7) {
      return {
        name: 'Hormuud',
        logo: hormuudLogo
      };
    }
    
    switch (prefix) {
      case '61':
      case '77':
        return {
          name: 'Hormuud',
          logo: hormuudLogo
        };
      case '62':
        return {
          name: 'Somtel',
          logo: somtelLogo
        };
      case '68':
        return {
          name: 'Somnet',
          logo: somnetLogo
        };
      case '63':
      case '65':
        return {
          name: 'Somlink',
          logo: somlinkLogo
        };
      case '71':
        return {
          name: 'Amtel',
          logo: amtelLogo
        };
      default:
        return {
          name: 'Provider',
          logo: ''
        };
    }
  }, []);
  const getProviderPrefix = useCallback((providerName: string) => {
    return getAllowedPrefixes(providerName)[0] ?? '';
  }, []);
  const getBrandBackgroundClass = useCallback((providerName: string) => {
    const providerLower = providerName?.toLowerCase() || '';
    switch (providerLower) {
      case 'hormuud':
        return 'bg-hormuud';
      case 'somtel':
        return 'bg-somtel';
      case 'somlink':
        return 'bg-somlink';
      case 'somnet':
        return 'bg-somnet';
      case 'amtel':
        return 'bg-amtel';
      default:
        return 'bg-primary';
    }
  }, []);

  // Set receiver prefix when provider is loaded.
  // MUHIIM: lambarada horay la verify gareeyay ama dalab loogu dhiibtay
  // MA ahan in si default ah loogu qoro. Kaliya prefix-ka shirkada.
  React.useEffect(() => {
    if (providerName) {
      if (isADSL) {
        setReceiverProviderPrefix('1');
        setReceiverNumber('1');
      } else {
        const prefix = getProviderPrefix(providerName);
        setReceiverProviderPrefix(prefix);
        setReceiverNumber(prefix);
      }
    }
  }, [providerName, isADSL]);

  // Lambarka lacag bixinta lama buuxiyo si default ah
  const offlineSenderRef = React.useRef(false);

  const handlePaymentSelect = useCallback((paymentId: string) => {
    setSelectedProvider(paymentId);
    const selectedPayment = paymentProviders.find(p => p.id === paymentId);
    if (selectedPayment) {
      // Prefix-ka telefoonka waa in laga soo qaadanaa magaca habka lacag bixinta,
      // ee ma aha `prefix_code` (kaas waa USSD).
      const prefix = getAllowedPrefixes(selectedPayment.provider_name)[0] ?? '';
      setPaymentProviderPrefix(prefix);
      // Only set prefix if user doesn't have a pre-filled sender phone
      if (!offlineSenderRef.current) {
        setPaymentNumber(prefix);
      }
    }
  }, [paymentProviders, getProviderPrefix]);
  const handlePaymentNumberChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');

    if (value.length <= 9) {
      setPaymentNumber(value);
      
      // Prefix-yada la aqbalayo ee habka lacag bixinta la doortay
      const selectedPayment = paymentProviders.find(p => p.id === selectedProvider);
      const paymentProviderName = selectedPayment?.provider_name ?? '';
      const allowed = getAllowedPrefixes(paymentProviderName);

      if (value.length >= 2 && !matchesAllowedPrefix(value, allowed)) {
        setPaymentNumberError(`Fadlan gali lambarka ${paymentProviderName} (${formatPrefixes(allowed)})`);
      } else {
        setPaymentNumberError('');
      }
    }
  }, [paymentProviders, selectedProvider, paymentProviderPrefix]);
  const handleReceiverNumberChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    
    // ADSL validation: 7 digits, starts with 1
    if (isADSL) {
      if (value.length <= 7) {
        setReceiverNumber(value);
        
        // Validate ADSL number
        if (value.length >= 1 && !value.startsWith('1')) {
          setReceiverNumberError('ADSL-ka wuxuu u baahan yahay lambar bilaabanaya 1');
        } else {
          setReceiverNumberError('');
        }
      }
    } else {
      // Mobile validation: 9 digits with provider prefix
      if (value.length <= 9) {
        setReceiverNumber(value);
        
        // Prefix-yada la aqbalayo ee shirkada xirmada
        const allowed = getAllowedPrefixes(providerName);
        if (value.length >= 2 && !matchesAllowedPrefix(value, allowed)) {
          setReceiverNumberError(`Fadlan gali lambarka shirkada ${providerName} (${formatPrefixes(allowed)})`);
        } else {
          setReceiverNumberError('');
        }
      }
    }
  }, [receiverProviderPrefix, providerName, isADSL]);
  const handleProceedToPayment = useCallback(() => {
    if (!selectedProvider) {
      return;
    }
    setShowPaymentModal(true);
  }, [selectedProvider]);
  const handleShowConfirmation = () => {
    if (!paymentNumber || !receiverNumber) {
      return;
    }
    
    // Validate payment number length (always 9 for payment)
    if (paymentNumber.length !== 9) {
      setPaymentNumberError('Fadlan gali lambarka oo dhan (9 digits)');
      return;
    }
    
    // ADSL receiver validation: 7 digits starting with 1
    if (isADSL) {
      if (receiverNumber.length !== 7) {
        setReceiverNumberError('ADSL-ka wuxuu u baahan yahay 7 lambar');
        return;
      }
      if (!receiverNumber.startsWith('1')) {
        setReceiverNumberError('ADSL-ka wuxuu u baahan yahay lambar bilaabanaya 1');
        return;
      }
    } else {
      // Mobile receiver validation: 9 digits
      if (receiverNumber.length !== 9) {
        setReceiverNumberError('Fadlan gali lambarka oo dhan (9 digits)');
        return;
      }
      
      // Prefix-ka lambarka xirmada — kaliya prefix-yada shirkada
      const allowedReceiver = getAllowedPrefixes(providerName);
      if (!matchesAllowedPrefix(receiverNumber, allowedReceiver)) {
        setReceiverNumberError(`Fadlan gali lambarka shirkada ${providerName} (${formatPrefixes(allowedReceiver)})`);
        return;
      }
    }

    // Prefix-ka lambarka lacag bixinta — kaliya prefix-yada habka la doortay
    const selectedPayment = paymentProviders.find(p => p.id === selectedProvider);
    const paymentProviderName = selectedPayment?.provider_name ?? '';
    const allowedPayment = getAllowedPrefixes(paymentProviderName);
    if (!matchesAllowedPrefix(paymentNumber, allowedPayment)) {
      setPaymentNumberError(`Fadlan gali lambarka ${paymentProviderName} (${formatPrefixes(allowedPayment)})`);
      return;
    }

    // Generate USSD code for display on confirmation screen
    const formatUssdAmountForDisplay = (amt: string): string => {
      const numAmount = parseFloat(amt);
      const dollars = Math.floor(numAmount);
      const cents = Math.round((numAmount - dollars) * 100);
      return `${dollars}*${cents.toString().padStart(2, '0')}`;
    };

    const selectedPaymentProvider = paymentProviders.find(p => p.id === selectedProvider);
    const displayAmount = packageData?.price?.replace('$', '') || '0';
    const formattedDisplayAmount = formatUssdAmountForDisplay(displayAmount);
    // USSD string comes strictly from the payment provider Iftin returned
    const displayPayment = selectedPaymentProvider ?? paymentProviders[0];
    const generatedUssdCode = buildPaymentUssd(displayPayment ?? {}, formattedDisplayAmount) ?? '';
    setUssdCodeForDisplay(generatedUssdCode);

    setShowPaymentModal(false);
    setShowConfirmationScreen(true);
  };
  const handlePaymentComplete = async () => {
    if (isOrderingBlocked()) {
      toast({
        title: 'Dalab lama sameyn karo',
        description: 'Xadka deynta (credit limit) waa la gaaray. Fadlan bixi fatuuradda.',
        variant: 'destructive',
      });
      return;
    }
    const selectedPaymentProvider = paymentProviders.find(p => p.id === selectedProvider);
    const amount = packageData?.price?.replace('$', '') || '0';

    // Show full-screen loading immediately
    setIsProcessingPayment(true);

  // ========== OFFLINE MODE DETECTION ==========
    if (!isReallyOnline || isOfflineFromState) {
      console.log('📴 Offline mode - generating USSD code');
      
      try {
        // Convert amount like "0.09" to "0*09" or "5.00" to "5*00"
        const formatUssdAmountOffline = (amt: string): string => {
          const numAmount = parseFloat(amt);
          const dollars = Math.floor(numAmount);
          const cents = Math.round((numAmount - dollars) * 100);
          return `${dollars}*${cents.toString().padStart(2, '0')}`;
        };
        
        const selectedPayment = paymentProviders.find(p => p.id === selectedProvider) ?? paymentProviders[0];
        const formattedAmount = formatUssdAmountOffline(amount);
        // Company payment number (admin-configured) - where money goes TO
        const companyPaymentNum = selectedPayment?.payment_number || paymentProviders[0]?.payment_number || '';
        
        const ussdCode = buildPaymentUssd(selectedPayment ?? {}, formattedAmount) ?? '';
        
        // customer_phone = app login phone (verifiedPhone)
        const verifiedPhone = localStorage.getItem('verifiedPhone') || '';
        const customerPhone = verifiedPhone.startsWith('+252') ? verifiedPhone.substring(4) : verifiedPhone;
        
        // sender_phone = user's phone they're paying FROM (state paymentNumber, NOT company number)
        const userSenderPhone = paymentNumber; // state variable - user's entered payment phone
        
        const offlineOrderData = {
            customer_phone: customerPhone || userSenderPhone, // app login phone, fallback to sender
            sender_phone: userSenderPhone,       // phone user pays FROM
            receiver_phone: receiverNumber,       // phone that gets the data package
            package_id: packageData?.id || '',
            provider_id: packageData?.providerId || '',
            payment_provider_id: selectedProvider,
            package_name: packageData?.name || 'Data Package',
            data_amount: packageData?.data || '',
            selling_price: parseFloat(amount),
            // cost_price = Iftin base price (never the sell price)
            cost_price: Number(packageData?.costPrice ?? 0),
            payment_number: companyPaymentNum,    // company number where money is sent TO
            status: 'pending_payment',
            delivery_status: 'pending'
          };
        queueOrder(offlineOrderData as any);

        // offline: order queued locally

        // Close confirmation and navigate to home
        setShowConfirmationScreen(false);
        navigate('/');
        
        // Open USSD dialer
        window.location.href = `tel:${encodeURIComponent(ussdCode)}`;

        return;
      } catch (error: any) {
        console.error('Offline payment error:', error);
        setErrorType('general');
        setErrorMessage('Khalad ayaa dhacay. Fadlan isku day mar kale.');
        setShowErrorModal(true);
        return;
      }
    }
    // ========== END OFFLINE MODE ==========

    try {
      const verifiedPhone = localStorage.getItem('verifiedPhone') || '';
      const customerPhone = verifiedPhone.startsWith('+252') ? verifiedPhone.substring(4) : verifiedPhone;

      // Use payment_number from database (admin-configured) for USSD code
      const companyPaymentNumber = selectedPaymentProvider?.payment_number || paymentProviders[0]?.payment_number || '';

      const cleanCustomerPaymentPhone = paymentNumber.startsWith('+252') ? paymentNumber.substring(4) : paymentNumber.startsWith('0') ? paymentNumber.substring(1) : paymentNumber;

      // ========================================
      // IFTIN PREPAID INTENT (device-less)
      // Kahor lacag bixinta: intent la sameeyo → payment_number + ussd_code
      // ayaa laga helaa Iftin. Kadib waxba lama sameynayo — Iftin ayaa SMS-ka
      // akhrinaya oo xirmada gaarsiinaya.
      // ========================================
      try {
        const created = await createIftinIntent({
          receiver_phone: receiverNumber,
          sender_phone: cleanCustomerPaymentPhone,
          package_id: String(packageData?.id ?? ''),
          payment_provider: String(selectedPaymentProvider?.provider_name ?? '').toLowerCase(),
          package_name: packageData?.name ?? 'Data Package',
          data_amount: packageData?.data ?? null,
          provider_id: packageData?.providerId ?? null,
          customer_phone: customerPhone || cleanCustomerPaymentPhone,
        });

        const sellPrice = parseFloat(amount) || created.amount;
        const sellUssd = applySellPriceToUssd(created.ussd_code, sellPrice);
        setIntent(created);
        setIntentSellPrice(sellPrice);
        setIntentUssd(sellUssd);
        setIntentState('pending');
        setIntentNotes(null);
        setShowConfirmationScreen(false);
        setIsProcessingPayment(false);

        if (sellUssd) {
          window.location.href = `tel:${encodeURIComponent(sellUssd)}`;
        }
        return;
      } catch (intentError: any) {
        const code = intentError instanceof IftinIntentError ? intentError.code : '';
        const iftinNotConfigured = code === 'missing_api_key' || code === 'invalid_tenant';
        if (!iftinNotConfigured) {
          // Ku muuji qaladka dhabta ah ee Iftin (tusaale price_below_base).
          setIsProcessingPayment(false);
          setShowConfirmationScreen(false);
          setErrorType('general');
          setErrorMessage(intentError?.message || 'Iftin API-ga wuu diiday dalabka.');
          setShowErrorModal(true);
          return;
        }
        console.log('ℹ️ Iftin lama dejin — habka maxalliga ah ayaa la isticmaalayaa');
      }

      // ========================================
      // FAIL-SAFE TRANSACTION GUARD (tenants aan Iftin isticmaalin)
      // Step 1: Insert pending_online_payments with RETRY (3 attempts)
      // ========================================
      console.log('🆕 Creating order with Fail-Safe Transaction Guard');

      
      const pendingPaymentData = {
        verified_phone: customerPhone,
        sender_phone: cleanCustomerPaymentPhone,
        receiver_phone: receiverNumber,
        provider_id: packageData?.providerId,
        package_id: packageData?.id,
        payment_provider: selectedPaymentProvider?.provider_name || '',
        expected_amount: parseFloat(amount),
        status: 'pending'
      };

      // DEDUP CHECK: Skip if a pending payment already exists for same sender+package+amount (last 10 min)
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: existingPending } = await supabase
        .from('pending_online_payments')
        .select('id')
        .eq('sender_phone', cleanCustomerPaymentPhone)
        .eq('expected_amount', parseFloat(amount))
        .eq('status', 'pending')
        .gte('created_at', tenMinutesAgo)
        .limit(1);

      if (existingPending && existingPending.length > 0) {
        console.log('⚠️ Duplicate pending payment detected, skipping insert. Existing ID:', existingPending[0].id);
      } else {
        // STRICT RETRY: 3 attempts, 500ms apart. USSD blocked until success.
        let insertSuccess = false;
        let lastError: any = null;
        
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const { error: pendingError } = await supabase
              .from('pending_online_payments')
              .insert([pendingPaymentData]);

            if (pendingError) {
              lastError = pendingError;
              console.warn(`⚠️ Attempt ${attempt}/3 failed:`, pendingError.message);
              if (attempt < 3) await new Promise(r => setTimeout(r, 500));
            } else {
              insertSuccess = true;
              console.log(`✅ Pending payment registered on attempt ${attempt}`);
              break;
            }
          } catch (dbError: any) {
            lastError = dbError;
            console.warn(`⚠️ Attempt ${attempt}/3 exception:`, dbError);
            if (attempt < 3) await new Promise(r => setTimeout(r, 500));
          }
        }

        // HARD STOP: If all retries failed, DO NOT open USSD
        if (!insertSuccess) {
          console.error('❌ All 3 insert attempts failed. USSD BLOCKED.', lastError);
          setIsProcessingPayment(false);
          setShowConfirmationScreen(false);
          setErrorType('general');
          setErrorMessage(
            lastError?.message
              ? `Cilad farsamo: ${lastError.message}`
              : 'Cilad farsamo ayaa dhacday. Fadlan isku day mar kale ama la xiriir adeegga macaamiisha.',
          );
          setShowErrorModal(true);
          return;
        }
      }

      // ========================================
      // Step 2: Generate USSD code (only reached on success)
      // ========================================
      const formatUssdAmount = (amt: string): string => {
        const numAmount = parseFloat(amt);
        const dollars = Math.floor(numAmount);
        const cents = Math.round((numAmount - dollars) * 100);
        return `${dollars}*${cents.toString().padStart(2, '0')}`;
      };
      
      const formattedAmount = formatUssdAmount(amount);
      const ussdCode = buildPaymentUssd(
        selectedPaymentProvider ?? paymentProviders[0] ?? {},
        formattedAmount,
      ) ?? '';
      console.log('📞 USSD Code generated:', ussdCode);

      // ========================================
      // Step 3: Open USSD dialer (ONLY after confirmed DB insert)
      // ========================================
      setShowConfirmationScreen(false);
      setIsProcessingPayment(false);
      window.location.href = `tel:${encodeURIComponent(ussdCode)}`;
      
      if (Capacitor.isNativePlatform()) {
        navigate('/');
      } else {
        setTimeout(() => navigate('/'), 1200);
      }

    } catch (error: any) {
      console.error('Payment error:', error);
      setIsProcessingPayment(false);
      setShowErrorModal(false);
      setShowConfirmationScreen(false);
      
      setTimeout(() => {
        setErrorType('general');
        setErrorMessage(error.message || 'Cilad farsamo ayaa dhacday. Fadlan isku day mar kale ama la xiriir adeegga macaamiisha.');
        setShowErrorModal(true);
      }, 100);
    }
  };
  // Status-ka intent-ka: poll 5s inta uu pending/matched/delivering yahay.
  useEffect(() => {
    if (!intent?.external_ref) return;
    if (!isIntentPending(intentState)) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await fetchIftinIntentStatus(intent.external_ref);
        if (cancelled) return;
        if (!isIntentPending(s.status)) {
          setIntent(null);
          return;
        }
        setIntentState(s.status);
        setIntentNotes(s.notes ?? null);
      } catch (e: any) {
        if (!cancelled) setIntentNotes(e?.message ?? null);
      }
    };
    void tick();
    const id = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intent?.external_ref, intentState]);

return <div className="min-h-screen bg-[#efefef] pb-24">
      {/* Header with safe-area padding for Android 12+ */}
      <div 
        className={`${getBrandBackgroundClass(providerName || '')} text-white py-4 px-4`}
        style={{ paddingTop: 'calc(1rem + var(--effective-safe-area-top, 0px))', boxSizing: 'border-box' as const }}
      >
        <div className="flex items-center">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white hover:bg-white/20 mr-4">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-medium">Dooro habka lacag bixinta</h1>
        </div>
      </div>

      {/* Payment Providers */}
      <div className="p-4 space-y-3 mt-4">
        {isReallyOnline !== true && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-3 mb-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
              📵 Offline Mode: USSD kaliya ayaa la isticmaali karaa
            </p>
          </div>
        )}
        {orderedPaymentProviders
          .map(payment => <div key={payment.id} onClick={() => handlePaymentSelect(payment.id)} className={`bg-white rounded-2xl p-4 flex items-center justify-between cursor-pointer border-2 transition-all shadow-lg hover:shadow-xl ${selectedProvider === payment.id ? 'border-primary shadow-xl scale-105' : 'border-transparent'}`} style={{
        boxShadow: selectedProvider === payment.id ? '0 10px 25px rgba(0, 153, 255, 0.3)' : '0 4px 12px rgba(0, 0, 0, 0.1)'
      }}>
              <div className="flex items-center">
                <div className="w-16 h-12 mr-4 flex items-center justify-center bg-gray-50 rounded-lg">
                  {payment.provider_logo && <img src={payment.provider_logo} alt={payment.provider_name} className="w-full h-full object-contain" loading="eager" decoding="async" />}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">{payment.provider_name}</h3>
                  {isReallyOnline !== true && payment.ussd_code_template && (
                    <p className="text-xs text-muted-foreground">USSD Code</p>
                  )}
                </div>
              </div>
              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${selectedProvider === payment.id ? 'bg-primary border-primary scale-110' : 'border-muted-foreground'}`}>
                {selectedProvider === payment.id && <Check className="w-5 h-5 text-primary-foreground" />}
              </div>
            </div>)}
      </div>

      {/* Payment Modal */}
      {showPaymentModal && <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-medium mb-4 text-center">
              {paymentProviders.find(p => p.id === selectedProvider)?.provider_name || 'Faahfaahinta lacag bixinta'}
            </h3>
            
            <div className="space-y-2">
              <Label htmlFor="payment-number" className="text-sm font-medium text-foreground">Gali Lambarka aad lacagta ka direyso</Label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-muted">
                  <img src={somaliaFlag} alt="Somalia" className="w-6 h-4" loading="eager" decoding="async" width={24} height={16} />
                  <span className="text-sm">+252</span>
                </div>
                <Input 
                  id="payment-number" 
                  type="text" 
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="tel-national"
                  placeholder={paymentProviderPrefix ? `${paymentProviderPrefix}XXXXXXX` : 'XXXXXXXXX'}
                  value={paymentNumber} 
                  onChange={handlePaymentNumberChange} 
                  maxLength={9} 
                  className={`flex-1 focus:border-[#0099ff] focus:ring-[#0099ff] ${paymentNumberError ? 'border-red-500' : ''}`}
                />
              </div>
              {paymentNumberError && (
                <p className="text-sm text-red-500 font-medium">{paymentNumberError}</p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="receiver-number" className="text-sm font-medium text-foreground">
                {isADSL ? 'Gali Lambarka ADSL-ka (7 lambar bilaabanaya 1)' : 'Gali Lambarka xirmada lagu shubaayo'}
              </Label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-muted">
                  <img src={somaliaFlag} alt="Somalia" className="w-6 h-4" loading="eager" decoding="async" width={24} height={16} />
                  <span className="text-sm">+252</span>
                </div>
                <Input 
                  id="receiver-number" 
                  type="text" 
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="tel-national"
                  placeholder={isADSL ? '1XXXXXX' : (receiverProviderPrefix ? `${receiverProviderPrefix}XXXXXXX` : 'XXXXXXXXX')}
                  value={receiverNumber} 
                  onChange={handleReceiverNumberChange} 
                  maxLength={isADSL ? 7 : 9} 
                  className={`flex-1 focus:border-[#0099ff] focus:ring-[#0099ff] ${receiverNumberError ? 'border-red-500' : ''}`}
                />
              </div>
              {receiverNumberError && (
                <p className="text-sm text-red-500 font-medium">{receiverNumberError}</p>
              )}
              {isADSL && (
                <p className="text-xs text-muted-foreground">ADSL: 7 lambar, tusaale: 1234567</p>
              )}
            </div>
            
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowPaymentModal(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleShowConfirmation} className="flex-1 bg-primary text-white">
                Pay Now
              </Button>
            </div>
          </div>
        </div>}

      {/* Confirmation Screen */}
      {showConfirmationScreen && <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-card rounded-2xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-center text-foreground">XAQIIJIN IIBSI</h2>
            
            {/* Package Details Card */}
            <div className="bg-white dark:bg-card rounded-lg border shadow-sm p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground">{packageData?.name || 'Package'}</h3>
                </div>
                <div className="text-right">
                  <span className={`text-2xl font-bold ${getBrandBackgroundClass(providerName || '').replace('bg-', 'text-')}`}>{packageData?.price}</span>
                </div>
              </div>
              <div className={`h-0.5 mb-3 ${getBrandBackgroundClass(providerName || '').replace('bg-', 'bg-')}`} style={{ width: '100%' }}></div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2">
                  <Zap className={`w-4 h-4 ${getBrandBackgroundClass(providerName || '').replace('bg-', 'text-')}`} />
                  <span className="text-sm text-muted-foreground">{packageData?.data || 'Data'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Smartphone className={`w-4 h-4 ${getBrandBackgroundClass(providerName || '').replace('bg-', 'text-')}`} />
                  <span className="text-sm text-muted-foreground">Mobile Internet</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className={`w-4 h-4 ${getBrandBackgroundClass(providerName || '').replace('bg-', 'text-')}`} />
                  <span className="text-sm text-muted-foreground">{packageData?.validity || 'Validity'}</span>
                </div>
              </div>
            </div>

            {/* Payment Number */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase">Lambarka lacagta diraayo</p>
              <div className="flex items-center gap-3 bg-muted rounded-lg p-3 border border-border">
                {getProviderFromPrefix(paymentNumber).logo ? <img src={getProviderFromPrefix(paymentNumber).logo} alt={getProviderFromPrefix(paymentNumber).name} className="w-10 h-10 rounded-full object-contain" loading="eager" decoding="async" /> : <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold">
                    {getProviderFromPrefix(paymentNumber).name.charAt(0)}
                  </div>}
                <span className="text-lg font-bold text-foreground">+252-{paymentNumber}</span>
              </div>
            </div>

            {/* Receiver Number */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase">Lambarka xirmada helaayo</p>
              <div className="flex items-center gap-3 bg-muted rounded-lg p-3 border border-border">
                {getProviderFromPrefix(receiverNumber).logo ? <img src={getProviderFromPrefix(receiverNumber).logo} alt={getProviderFromPrefix(receiverNumber).name} className="w-10 h-10 rounded-full object-contain" loading="eager" decoding="async" /> : <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold">
                    {getProviderFromPrefix(receiverNumber).name.charAt(0)}
                  </div>}
                <span className="text-lg font-bold text-foreground">+252-{receiverNumber}</span>
              </div>
            </div>

            {/* Confirmation Message - Flashing Warning */}
            <div className="bg-destructive text-destructive-foreground p-3 rounded-lg text-center animate-pulse">
              <p className="font-semibold text-sm">
                Ma hubtaa inaad {packageData?.price} ka dirtid {paymentNumber}?
              </p>
            </div>

            {/* USSD Code with Copy Button */}
            <div className="flex items-center justify-between bg-muted rounded-lg p-3 border border-border">
              <code className="text-lg font-bold text-primary select-all">
                {ussdCodeForDisplay}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(ussdCodeForDisplay);
                  toast({
                    title: "La copy-gareeye!",
                    description: "USSD code-ka la copy-gareeye",
                  });
                }}
                className="ml-2"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>

            {/* Processing Indicator */}
            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowConfirmationScreen(false);
                  setShowPaymentModal(true);
                }} 
                className="flex-1 py-5 text-base font-bold border-2"
              >
                MAYA
              </Button>
              <Button 
                onClick={() => {
                  if (isProcessingPayment) return;
                  handlePaymentComplete();
                }}
                disabled={isProcessingPayment}
                className="flex-1 py-5 text-base font-bold bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                 HAA IIBSO
              </Button>
            </div>
          </div>
        </div>}

      {/* Fixed Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pt-4 pb-8 bg-[#efefef]">
        <Button onClick={handleProceedToPayment} className="w-full bg-primary text-white font-semibold py-4 rounded-2xl text-lg hover:opacity-90 transition-opacity">
          {selectedProvider ? `Bixi Hada ${packageData?.price}` : 'Dooro habka lacag bixinta'}
        </Button>
      </div>

      <PaymentLoadingOverlay isLoading={isProcessingPayment} />

      {/* Payment Error Modal */}
      <PaymentErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        onRetry={() => {
          setShowErrorModal(false);
          setShowConfirmationScreen(true);
        }}
        errorType={errorType}
        errorMessage={errorMessage}
      />

      {/* Offline Phone Input Sheet */}
      <OfflinePhoneInputSheet 
        open={showOfflineSheet} 
        onOpenChange={setShowOfflineSheet}
      />
    </div>;
};
export default PaymentProviders;