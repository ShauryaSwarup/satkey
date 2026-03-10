"use client";
import React from "react";
import { InfiniteSlider } from "./InfiniteSlider";
import { cn } from "@/lib/utils";

type Logo = {
    src: string;
    alt: string;
    className: string;
};

type LogoCloudProps = React.ComponentProps<"div"> & {
    logos: Logo[];
};

export function LogoCloud({ className, logos, ...props }: LogoCloudProps) {
    return (
        <div
            {...props}
            className={cn(
                "overflow-hidden py-8 mask-[linear-gradient(to_right,transparent,black_20%,black_80%,transparent)]",
                className
            )}
        >
            <InfiniteSlider gap={42} reverse duration={80} durationOnHover={25}>
                {logos.map((logo) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        alt={logo.alt}
                        className={`pointer-events-none h-4 select-none md:h-5 ${logo.className}`}
                        key={`logo-${logo.alt}`}
                        loading="lazy"
                        src={logo.src}
                    />
                ))}
            </InfiniteSlider>
        </div>
    );
}
