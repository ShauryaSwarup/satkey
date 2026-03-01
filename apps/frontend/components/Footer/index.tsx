"use client";
import React from "react";
import {
    Mail,
    Phone,
    MapPin,
    Facebook,
    Instagram,
    Twitter,
    Dribbble,
    Globe,
} from "lucide-react";
import { TextHoverEffect } from "./TextHoverEffect";
import { FooterBackgroundGradient } from "./FooterBackgroundGradient";

const Footer = () => {
    // Footer link data
    const footerLinks = [
        {
            title: "About Us",
            links: [
                { label: "Company History", href: "#" },
                { label: "Meet the Team", href: "#" },
                { label: "Employee Handbook", href: "#" },
                { label: "Careers", href: "#" },
            ],
        },
        {
            title: "Helpful Links",
            links: [
                { label: "FAQs", href: "#" },
                { label: "Support", href: "#" },
                {
                    label: "Live Chat",
                    href: "#",
                    pulse: true,
                },
            ],
        },
    ];

    // Contact info data
    const contactInfo = [
        {
            icon: <Mail size={18} className="text-orange-400" />,
            text: "hello@satkey.com",
            href: "mailto:hello@satkey.com",
        },
        {
            icon: <Phone size={18} className="text-orange-400" />,
            text: "+91 86373 73116",
            href: "tel:+918637373116",
        },
        {
            icon: <MapPin size={18} className="text-orange-400" />,
            text: "Sylhet, Bangladesh",
        },
    ];

    // Social media icons
    const socialLinks = [
        { icon: <Facebook size={20} />, label: "Facebook", href: "#" },
        { icon: <Instagram size={20} />, label: "Instagram", href: "#" },
        { icon: <Twitter size={20} />, label: "Twitter", href: "#" },
        { icon: <Dribbble size={20} />, label: "Dribbble", href: "#" },
        { icon: <Globe size={20} />, label: "Globe", href: "#" },
    ];

    return (
        <footer className="bg-[#0F0F11]/10 relative h-fit rounded-3xl overflow-hidden m-8 border border-white/5">
            <div className="max-w-7xl mx-auto p-14 z-40 relative">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 md:gap-8 lg:gap-16 pb-12">
                    {/* Brand section */}
                    <div className="flex flex-col space-y-4">
                        <div className="flex items-center space-x-2">
                            <span className="text-orange-400 text-3xl font-extrabold">
                                &hearts;
                            </span>
                            <span className="text-white text-3xl font-bold tracking-tight">SatKey</span>
                        </div>
                        <p className="text-white/50 text-sm leading-relaxed">
                            SatKey is a one-click platform for Bitcoin staking in Starknet.
                        </p>
                    </div>

                    {/* Footer link sections */}
                    {footerLinks.map((section) => (
                        <div key={section.title}>
                            <h4 className="text-white text-lg font-semibold mb-6">
                                {section.title}
                            </h4>
                            <ul className="space-y-3">
                                {section.links.map((link) => (
                                    <li key={link.label} className="relative">
                                        <a
                                            href={link.href}
                                            className="text-white/50 hover:text-orange-400 transition-colors"
                                        >
                                            {link.label}
                                        </a>
                                        {link.pulse && (
                                            <span className="absolute top-1 right-[-14px] w-2 h-2 rounded-full bg-orange-400 animate-pulse"></span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}

                    {/* Contact section */}
                    <div>
                        <h4 className="text-white text-lg font-semibold mb-6">
                            Contact Us
                        </h4>
                        <ul className="space-y-4">
                            {contactInfo.map((item, i) => (
                                <li key={i} className="flex items-center space-x-3 text-white/50">
                                    {item.icon}
                                    {item.href ? (
                                        <a
                                            href={item.href}
                                            className="hover:text-orange-400 transition-colors"
                                        >
                                            {item.text}
                                        </a>
                                    ) : (
                                        <span className="hover:text-orange-400 transition-colors">
                                            {item.text}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <hr className="border-t border-white/10 my-8" />

                {/* Footer bottom */}
                <div className="flex flex-col md:flex-row justify-between items-center text-sm space-y-4 md:space-y-0">
                    {/* Social icons */}
                    <div className="flex space-x-6 text-white/30">
                        {socialLinks.map(({ icon, label, href }) => (
                            <a
                                key={label}
                                href={href}
                                aria-label={label}
                                className="hover:text-orange-400 transition-colors"
                            >
                                {icon}
                            </a>
                        ))}
                    </div>

                    {/* Copyright */}
                    <p className="text-center md:text-left text-white/30">
                        &copy; {new Date().getFullYear()} SatKey. All rights reserved.
                    </p>
                </div>
            </div>

            {/* Text hover effect */}
            <div className="lg:flex hidden h-120 -mt-52 -mb-36">
                <TextHoverEffect text="SatKey" className="z-50" />
            </div>

            <FooterBackgroundGradient />
        </footer>
    );
};

export default Footer;
