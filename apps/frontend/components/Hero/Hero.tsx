import AntiGravityCanvas from "./AntiGravityCanvas";
import HeroContent from "./HeroContent";

const Hero: React.FC = () => {
    return (
        <div className="relative w-full h-screen bg-black overflow-hidden selection:bg-blue-500 selection:text-white">
            <AntiGravityCanvas />
            <HeroContent />
        </div>
    );
}

export default Hero;