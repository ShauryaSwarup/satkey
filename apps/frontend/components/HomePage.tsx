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
        src: "https://svgl.app/library/nvidia-wordmark-light.svg",
        alt: "Nvidia Logo",
    },
    {
        src: "https://svgl.app/library/supabase_wordmark_light.svg",
        alt: "Supabase Logo",
    },
    {
        src: "https://svgl.app/library/openai_wordmark_light.svg",
        alt: "OpenAI Logo",
    },
    {
        src: "https://svgl.app/library/turso-wordmark-light.svg",
        alt: "Turso Logo",
    },
    {
        src: "https://svgl.app/library/vercel_wordmark.svg",
        alt: "Vercel Logo",
    },
    {
        src: "https://svgl.app/library/github_wordmark_light.svg",
        alt: "GitHub Logo",
    },
    {
        src: "https://svgl.app/library/claude-ai-wordmark-icon_light.svg",
        alt: "Claude AI Logo",
    },
    {
        src: "https://svgl.app/library/clerk-wordmark-light.svg",
        alt: "Clerk Logo",
    },
];

export default function HomePage() {
    const { isConnected, isAuthenticated } = useAuth();
    const [showAuth, setShowAuth] = useState(false);

    // If user is connected but not authenticated, show ZK auth flow
    if (isConnected && !isAuthenticated) {
        return (
            <div className="flex flex-col min-h-screen bg-black">
                <Hero />
                <div className="flex-1 flex items-center justify-center py-20 px-4">
                    <ZkAuthFlow onComplete={() => setShowAuth(false)} />
                </div>
                <Footer />
            </div>
        );
    }

    // If user is authenticated, show dashboard
    if (isConnected && isAuthenticated) {
        return (
            <div className="flex flex-col min-h-screen bg-black">
                <Dashboard />
            </div>
        );
    }

    // Default: Show landing page
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
