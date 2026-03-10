"use client"

import Hero from "@/components/Hero/Hero";
import { LogoCloud } from "@/components/Slider/LogoCloud";
import { FeatureCards } from "@/components/Cards/FeatureCards";
import Footer from "@/components/Footer";
import Dashboard from "@/components/Dashboard";
import ZkAuthFlow from "@/components/Auth/ZkAuthFlow";
import { useAuth } from "@/providers/AuthProvider";
import { useState } from "react";

const logos = [
    {
        src: "https://svgl.app/library/supabase_wordmark_light.svg",
        alt: "Supabase Logo",
        className: "dark:brightness-0 dark:invert"
    },
    {
        src: "https://svgl.app/library/vercel_wordmark.svg",
        alt: "Vercel Logo",
        className: "dark:brightness-0 dark:invert"
    },
    {
      src: "https://moonli.me/wp-content/uploads/2022/03/moonli-logo-black.svg",
      alt: "Moonli Logo",
      className: "dark:brightness-0 dark:invert"
    },
    {
      src: "/unisat.png",
      alt: "Unisat Logo"
    },
    {
      src: "https://cdn.prod.website-files.com/624b08d53d7ac60ccfc11d8d/645d01e85e0969992e9e4caa_Full_Logo.webp",
      alt: "Xverse Logo",
      className: ""
    },
    {
      src: "https://www.starknet.io/wp-content/uploads/2025/09/wbtc-white-logo.png",
      alt: "WBTC Logo",
      className: ""
    },
    {
      src: "/starkzap.webp",
      alt: "Starkzap Logo",
      className: ""
    },
    {
      src: "/avnu-white.svg",
      alt: "Avnu Logo",
      className: ""
    },
    {
      src: "/atomiq.svg",
      alt: "AtomiqLabs Logo",
      className: ""
    },
    {
      src: "https://cdn.prod.website-files.com/6800c6be3f80a4179f8b4a5f/68064cd4e1316384a0a93bf8_Group%201597882142.svg",
      alt: "Bitcoin Logo",
      className: ""
    },
    {
      src: "https://www.starknet.io/wp-content/themes/Starknet/assets/img/starknet-logo-light.svg",
      alt: "Starknet Logo",
      className: ""
    }
];

export default function HomePage() {
    return (
        <div className="flex flex-col min-h-screen bg-black">
            <Hero />

            <section className="relative py-12 bg-black border-y border-white/5 overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 h-25 bg-orange-500/5 blur-[100px] pointer-events-none" />
                <div className="container mx-auto px-4 relative z-10">
                    <h2 className="mb-8 text-center font-medium text-white/30 text-xs tracking-widest uppercase">
                        Powered by industry-leading technology
                    </h2>
                    <LogoCloud logos={logos} />
                </div>
            </section>

            <section className="relative py-24 bg-linear-180 from-orange-400/10 to-black overflow-hidden">
                <div className="absolute bottom-0 right-0 w-125 h-125 bg-orange-500/5 blur-[150px] pointer-events-none" />
                <div className="container mx-auto px-4 max-w-7xl relative z-10">
                    <div className="mb-16 text-center">
                        <h2 className="text-3xl md:text-5xl font-bold text-white mb-4 tracking-tight">
                            One Bitcoin Key. Infinite Possibilities.
                        </h2>
                        <p className="text-white/50 text-lg max-w-2xl mx-auto">
                            Zero-knowledge proofs meet deterministic identity. Your Bitcoin wallet unlocks gasless DeFi on Starknet.
                        </p>
                    </div>
                    <FeatureCards />
                </div>
            </section>

            <Footer />
        </div>
    );
}
