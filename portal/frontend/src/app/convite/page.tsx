import type { Metadata } from 'next';
import { PublicCard } from '@/components/public-card';
import { InvitationFlow } from './flow';

export const metadata: Metadata = { title: 'Convite', referrer: 'no-referrer' };

export default function InvitationPage() {
  return (
    <PublicCard title="Convite para o portal">
      <InvitationFlow />
    </PublicCard>
  );
}
