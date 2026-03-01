"use client";

import { Info } from 'lucide-react';
import Connect from '@/components/Wallet/Connect';
import Profile from '@/components/Wallet/Profile';
import { useAuth } from '@/providers/AuthProvider';

const Navigation: React.FC = () => {
  const { isConnected } = useAuth();

  return (
    <nav className="absolute top-0 left-0 w-full z-[60] flex justify-between items-center p-6 md:p-8">
      <div className="flex items-center space-x-2">
        <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
          <span className="font-bold text-black text-lg">SK</span>
        </div>
        <span className="text-white font-medium tracking-wide text-lg"><span className="text-orange-400">Sat</span>Key</span>
      </div>
      <div className="hidden md:flex space-x-8 text-sm font-medium text-white/70">
        <a href="#" className="hover:text-white transition-colors">Experiments</a>
        <a href="#" className="hover:text-white transition-colors">Case Studies</a>
        <a href="#" className="hover:text-white transition-colors">About</a>
      </div>
      {/* Conditional: Show Profile when connected, Connect button when not */}
      {isConnected ? <Profile /> : <Connect />}
    </nav>
  )
}

export default Navigation;
