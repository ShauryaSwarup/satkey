import { ArrowRight } from "lucide-react";

const HeroContent: React.FC = () => {
    return (
        <div className='absolute top-[100px] left-0 right-0 bottom-0 z-20 flex flex-col items-center justify-center pointer-events-none px-6 md:px-12 lg:px-24 pb-8'>
            <div className='max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-24 items-center'>
                {/* LEFT SIDE: Content */}
                <div className='relative flex flex-col items-center lg:items-start text-center lg:text-left space-y-6 md:space-y-8 animate-fade-in order-2 lg:order-1'>
                    <div className='inline-block'>
                        <span className='py-1 px-3 border border-white/20 rounded-full text-xs font-bold text-white/60 tracking-widest uppercase bg-white/5 backdrop-blur-sm'>
                            Bitcoin-Native Identity
                        </span>
                    </div>

                    <h1 className='text-5xl sm:text-7xl md:text-8xl lg:text-[120px] font-bold text-transparent tracking-tight leading-[0.9]'>
                        <span className='bg-clip-text bg-linear-to-b from-orange-200 to-orange-400'>
                            Sat
                        </span>
                        <span className='bg-clip-text bg-linear-to-b from-white to-white/40'>
                            {" "}
                            Key
                        </span>
                    </h1>

                    <p className='max-w-xl text-base md:text-lg lg:text-xl text-white/60 font-light leading-relaxed'>
                        Your{" "}
                        <span className='text-orange-400 font-medium'>
                            Bitcoin wallet
                        </span>{" "}
                        becomes your{" "}
                        <span className='text-[#ecf1f2] font-medium'>
                            Stark
                        </span>
                        <span className='text-[#d87a8b] font-medium'>net</span>{" "}
                        identity. No seed phrase. No bridge friction. Just{" "}
                        <span className='text-orange-400 font-medium'>
                            ZK-powered DeFi
                        </span>.
                    </p>

                    <div className='pt-2 md:pt-4 pointer-events-auto'>
                        <button className="group relative inline-flex items-center gap-3 px-6 md:px-8 py-3 md:py-4 bg-white/15 backdrop-blur-xl text-white rounded-full border border-white/30 font-semibold tracking-wide overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.25)] transition-all duration-300 hover:bg-white/25 active:scale-95 animate-button-pulse text-sm md:text-base hover:cursor-pointer">
                            {/* glass shine */}
                            <span className='pointer-events-none absolute inset-0 rounded-full bg-linear-to-b from-white/25 via-white/5 to-transparent opacity-60 group-hover:opacity-80 transition-opacity' />

                            <span className='relative z-10 font-semibold'>
                                Connect <span className="text-orange-400">Bitcoin</span> Wallet
                            </span>

                            <ArrowRight className='w-4 h-4 relative z-10 animate-arrow-nudge group-hover:translate-x-2 group-hover:animate-none transition-transform' />
                        </button>
                    </div>
                </div>

                {/* RIGHT SIDE: Video Container */}
                {/* 'absolute inset-0' puts it behind text on mobile; 'lg:relative' puts it back in the grid for desktop */}
                <div className='absolute inset-0 lg:relative flex items-center justify-center lg:justify-end order-1 lg:order-2 self-center w-full pointer-events-none z-0'>
                    {/* - Mobile: 'w-[80%]' or 'max-w-[400px]' to make it large behind the text.
        - Mobile: 'opacity-50' to '70' (lower opacity helps text legibility since it's now overlapping).
        - Desktop (lg): Resets to 'max-w-[450px]' and 'opacity-100'.
    */}
                    <div className='relative flex items-center justify-center overflow-hidden border border-white/10 rounded-3xl duration-700 hover:border-white/20 shadow-2xl w-full max-w-[320px] sm:max-w-[400px] lg:max-w-[450px] lg:max-h-[100vh] opacity-60 lg:opacity-100'>
                        <video
                            autoPlay
                            loop
                            muted
                            playsInline
                            className='w-full h-auto mix-blend-screen block'
                        >
                            <source src='/hero-bg.mp4' type='video/mp4' />
                        </video>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HeroContent;
