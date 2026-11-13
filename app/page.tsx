'use client';

import { useStore } from '@/lib/store';
import { RoleSwitcher } from '@/components/demo/RoleSwitcher';
import { ConsumerFeed } from '@/components/consumer/ConsumerFeed';
import { BusinessDashboard } from '@/components/business/BusinessDashboard';
import { AdminPortal } from '@/components/admin/AdminPortal';

export default function Page() {
  const { state } = useStore();

  return (
    <>
      <RoleSwitcher />
      {state.role === 'consumer' && <ConsumerFeed />}
      {state.role === 'business' && <BusinessDashboard />}
      {state.role === 'admin' && <AdminPortal />}
    </>
  );
}
