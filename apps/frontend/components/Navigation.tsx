"use client";

import Connect from '@/components/Wallet/Connect';
import Profile from '@/components/Wallet/Profile';
import { useAuth } from '@/providers/AuthProvider';
import Image from 'next/image';

const Navigation: React.FC = () => {
  const { isConnected } = useAuth();

  return (
    <nav className="absolute top-0 left-0 w-full z-60 flex justify-between items-center p-6 md:p-8">
      <div className="flex items-center">
        <Image
          src="/logo.png"
          alt="SatKey Logo"
          width={120}
          height={66}
          className="h-8 w-auto md:h-10"
          priority
        />
        <span className="text-white font-medium tracking-wide text-lg"><span className="text-orange-400">Sat</span>Key</span>
      </div>
      {/* Conditional: Show Profile when connected, Connect button when not */}
      {isConnected ? <Profile /> : <Connect />}
    </nav>
  )
}

export default Navigation;
