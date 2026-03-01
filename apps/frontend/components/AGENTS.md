# COMPONENTS KNOWLEDGE BASE

## OVERVIEW
All UI components for the single-page app, organized by feature into PascalCase subdirectories.

## STRUCTURE
```
components/
├── Hero/           # Full-screen landing section (canvas + content)
│   ├── Hero.tsx            # Shell: composes AntiGravityCanvas + HeroContent
│   ├── AntiGravityCanvas.tsx  # Interactive particle canvas animation
│   └── HeroContent.tsx     # Text, CTA, and overlaid copy
├── Wallet/         # Bitcoin wallet connection via sats-connect
│   └── Connect.tsx         # Trigger button + wallet_connect RPC call
├── Cards/          # Feature grid with hover glow effects
│   ├── FeatureCards.tsx    # CSS Grid layout, renders GridItem list
│   └── GlowingEffect.tsx   # Proximity-based border glow primitive
├── Slider/         # Infinite logo marquee
│   ├── InfiniteSlider.tsx  # Animation primitive
│   └── LogoCloud.tsx       # Consumes logos prop array, renders slider
├── Footer/         # Page footer
│   ├── index.tsx           # Footer shell
│   ├── FooterBackgroundGradient.tsx
│   └── TextHoverEffect.tsx # SVG/text hover animation
├── Navigation.tsx  # Top nav bar with brand + Connect button
└── HomePage.tsx    # Page-level compositor (assembles all sections)
```

## WHERE TO LOOK
| Task | File |
|------|------|
| Editing hero copy or CTA | `Hero/HeroContent.tsx` |
| Changing canvas particle behavior | `Hero/AntiGravityCanvas.tsx` |
| Wallet connect logic / address handling | `Wallet/Connect.tsx` |
| Feature card content or grid layout | `Cards/FeatureCards.tsx` |
| Glow/border hover effect | `Cards/GlowingEffect.tsx` |
| Logo marquee items | `Slider/LogoCloud.tsx` (logos prop in `HomePage.tsx`) |
| Nav links or brand | `Navigation.tsx` |
| Page section order / spacing | `HomePage.tsx` |

## CONVENTIONS
- Subdirectory `index.tsx` files export the default component for the folder (see `Footer/index.tsx`).
- Animation primitives (`AntiGravityCanvas`, `InfiniteSlider`, `GlowingEffect`) are kept separate from their consuming components so they can be swapped without touching layout.
- `Wallet/Connect.tsx` handles its own click handler inline. When auth state is added, move wallet addresses into `AuthProvider` instead of local `console.log`.

## ANTI-PATTERNS
- Don't add new top-level `.tsx` files here. `Navigation.tsx` and `HomePage.tsx` exist as legacy exceptions. New work goes in a named subdirectory.
- `HomePage.tsx` already blurs the page/component boundary. Don't extend this pattern. Section layout belongs in `app/page.tsx`.
- Don't import between sibling feature folders (e.g., `Hero/` importing from `Wallet/`). Route shared primitives through `lib/` or a dedicated `components/ui/` folder.
- `GlowingEffect` and `TextHoverEffect` are visual primitives, not feature components. Don't add business logic to them.
