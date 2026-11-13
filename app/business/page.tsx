'use client';

import { useStore } from '@/lib/store';
import { BusinessAuth } from '@/components/business/BusinessAuth';
import { BusinessDashboard } from '@/components/business/BusinessDashboard';

export default function BusinessPage() {
  const { account } = useStore();
  return account ? <BusinessDashboard /> : <BusinessAuth />;
}
