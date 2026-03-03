"use client";
import React from "react";
import { Box, Lock, Search, Settings, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlowingEffect } from "./GlowingEffect";

interface GridItemProps {
    area: string;
    icon: React.ReactNode;
    title: string;
    description: React.ReactNode;
}

const GridItem = ({ area, icon, title, description }: GridItemProps) => {
    return (
        <li className={cn("min-h-56 list-none", area)}>
            <div className="relative h-full rounded-[1.25rem] border-[0.75px] border-white/10 p-2 md:rounded-3xl md:p-3">
                <GlowingEffect
                    spread={40}
                    glow={true}
                    disabled={false}
                    proximity={64}
                    inactiveZone={0.01}
                    borderWidth={3}
                />
                <div className="relative flex h-full flex-col justify-between gap-6 overflow-hidden rounded-xl border-[0.75px] border-white/10 bg-orange-300/10 p-6 shadow-sm md:p-6">
                    <div className="relative flex flex-1 flex-col justify-between gap-3">
                        <div className="w-fit rounded-lg border-[0.75px] border-white/10 bg-white/5 p-2 text-white">
                            {icon}
                        </div>
                        <div className="space-y-3">
                            <h3 className="pt-0.5 text-xl leading-5.5 font-semibold font-sans tracking-[-0.04em] md:text-2xl md:leading-7.5 text-balance text-white">
                                {title}
                            </h3>
                            <h2 className="[&_b]:md:font-semibold [&_strong]:md:font-semibold font-sans text-sm leading-4.5 md:text-base md:leading-5.5 text-white/50 text-wrap">
                                {description}
                            </h2>
                        </div>
                    </div>
                </div>
            </div>
        </li>
    );
};

export const FeatureCards = () => {
    return (
        <ul className="grid grid-cols-1 grid-rows-none gap-4 md:grid-cols-12 md:grid-rows-3 lg:gap-4 xl:max-h-136 xl:grid-rows-2">
            <GridItem
                area="md:[grid-area:1/1/2/7] xl:[grid-area:1/1/2/5]"
                icon={<Lock className="h-4 w-4" />}
                title="Zero-Knowledge Authentication"
                description="Prove Bitcoin ownership without exposing your private key. ZK proofs verify signatures on-chain."
            />
            <GridItem
                area="md:[grid-area:1/7/2/13] xl:[grid-area:2/1/3/5]"
                icon={<Box className="h-4 w-4" />}
                title="Deterministic Identity"
                description="Same Bitcoin key = same Starknet address. Every time. No seed phrases to manage."
            />
            <GridItem
                area="md:[grid-area:2/1/3/7] xl:[grid-area:1/5/3/8]"
                icon={<Sparkles className="h-4 w-4" />}
                title="Gasfree Transactions"
                description="Integrated paymaster covers gas fees. Users interact with DeFi without holding STRK."
            />
            <GridItem
                area="md:[grid-area:2/7/3/13] xl:[grid-area:1/8/2/13]"
                icon={<Settings className="h-4 w-4" />}
                title="Bridge-Ready"
                description="Seamless integration with Atomiq bridge. Move BTC to Starknet and start earning."
            />
            <GridItem
                area="md:[grid-area:3/1/4/13] xl:[grid-area:2/8/3/13]"
                icon={<Search className="h-4 w-4" />}
                title="One-Click Staking"
                description="Connect wallet, bridge assets, stake automatically. Your Bitcoin works for you on Starknet."
            />
        </ul>
    );
};
