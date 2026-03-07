"use client";

import Connect from '@/components/Wallet/Connect';
import Profile from '@/components/Wallet/Profile';
import { useAuth } from '@/providers/AuthProvider';
import Image from 'next/image';
import Link from 'next/link';
import Modal from '@/components/ui/Modal';
import ZkAuthFlow from '@/components/Auth/ZkAuthFlow';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X as CloseIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

const Navigation: React.FC = () => {
  const { isConnected, isAuthenticated } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  // Automatically open auth modal if connected but not authenticated
  useEffect(() => {
    if (isConnected && !isAuthenticated) {
      setIsAuthModalOpen(true);
    } else if (isAuthenticated) {
      setIsAuthModalOpen(false);
    }
  }, [isConnected, isAuthenticated]);

  const navLinks = [
    { name: 'Dashboard', href: '/dashboard' },
    { name: 'Stake', href: '/stake' },
    { name: 'Unstake', href: '/unstake' },
    { name: 'Bridge', href: '/bridge' },
  ];

  return (
    <>
      <nav className="fixed top-0 left-0 w-full z-60 flex justify-between items-center p-4 md:p-6 bg-black/20 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="SatKey Logo"
              width={120}
              height={66}
              className="h-8 w-auto md:h-10"
              priority
            />
            <span className="text-white font-medium tracking-wide text-lg hidden sm:inline">
              <span className="text-orange-400">Sat</span>Key
            </span>
          </Link>

          {/* Desktop Navigation Links */}
          {isConnected && (
            <div className="hidden lg:flex items-center gap-6">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "text-sm font-medium transition-colors hover:text-orange-400",
                    pathname === link.href ? "text-orange-400" : "text-white/60"
                  )}
                >
                  {link.name}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Conditional: Show Profile when connected, Connect button when not */}
          <div className="hidden sm:block">
            {isConnected ? <Profile /> : <Connect />}
          </div>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="lg:hidden p-2 text-white/60 hover:text-white"
          >
            {isMobileMenuOpen ? <CloseIcon /> : <Menu />}
          </button>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-full left-0 w-full bg-[#0a0a0a] border-b border-white/10 p-6 flex flex-col gap-4 lg:hidden"
            >
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    "text-lg font-medium py-2",
                    pathname === link.href ? "text-orange-400" : "text-white/60"
                  )}
                >
                  {link.name}
                </Link>
              ))}
              <div className="pt-4 border-t border-white/5 sm:hidden">
                {isConnected ? <Profile /> : <Connect />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Auth Modal */}
      <Modal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        title="Zero-Knowledge Authentication"
      >
        <ZkAuthFlow onComplete={() => setIsAuthModalOpen(false)} />
      </Modal>
    </>
  );
};

export default Navigation;
