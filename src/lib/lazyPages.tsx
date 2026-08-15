import * as React from 'react';
import Index from '@/components/pages/Index';
import ProviderSelection from '@/components/pages/ProviderSelection';
import CategorySelection from '@/components/pages/CategorySelection';
import DataPackages from '@/components/pages/DataPackages';
import PaymentProviders from '@/components/pages/PaymentProviders';
import PaymentSuccess from '@/components/pages/PaymentSuccess';
import OfflineMode from '@/components/pages/OfflineMode';
import OrderHistory from '@/components/pages/OrderHistory';
import Notifications from '@/components/pages/Notifications';
import Profile from '@/components/pages/Profile';
import PrivacyPolicy from '@/components/pages/PrivacyPolicy';
import AdminLogin from '@/components/pages/AdminLogin';
import SimpleAdminDashboard from '@/components/pages/SimpleAdminDashboard';
import SimpleAdminDetail from '@/components/pages/SimpleAdminDetail';
import PlatformLayout from '@/components/pages/platform/PlatformLayout';
import PlatformDashboard from '@/components/pages/platform/PlatformDashboard';
import PlansPage from '@/components/pages/platform/PlansPage';
import ResellersPage from '@/components/pages/platform/ResellersPage';
import ResellerNewPage from '@/components/pages/platform/ResellerNewPage';
import ResellerDetailPage from '@/components/pages/platform/ResellerDetailPage';

/** Pages are kept ready in memory so route changes never flash a blank screen. */
const pages = {
  Index,
  ProviderSelection,
  CategorySelection,
  DataPackages,
  PaymentProviders,
  PaymentSuccess,
  OfflineMode,
  OrderHistory,
  Notifications,
  Profile,
  PrivacyPolicy,
  AdminLogin,
  SimpleAdminDashboard,
  SimpleAdminDetail,
  PlatformLayout,
  PlatformDashboard,
  PlansPage,
  ResellersPage,
  ResellerNewPage,
  ResellerDetailPage,
} satisfies Record<string, React.ComponentType<any>>;

export type PageKey = keyof typeof pages;

export function lazyPage(key: PageKey): React.ComponentType<any> {
  return pages[key];
}

export function prefetchPage(_key: PageKey) {}

export function warmPages() {}

/** Kept for route compatibility; no loading layer is rendered. */
export function PageSuspense({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

