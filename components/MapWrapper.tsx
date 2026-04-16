'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

interface MapWrapperProps {
  customers: any[];
  isPublic?: boolean;
}

const ClientMap = dynamic(() => import('./ClientMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[600px] flex items-center justify-center bg-slate-50 dark:bg-slate-900/50">
      <Loader2 className="size-8 animate-spin text-primary" />
    </div>
  ),
});

export default function MapWrapper(props: MapWrapperProps) {
  return <ClientMap {...props} />;
}
