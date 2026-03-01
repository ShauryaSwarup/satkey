# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-28
**Framework:** Next.js 16.1 (App Router), React 19.2, TypeScript 5, Tailwind v4
**Domain:** BTCFi dApp (Starknet/Bitcoin staking via sats-connect)

## OVERVIEW
Sat Key is a BTCFi dApp providing one-click staking for Bitcoin on Starknet. It uses modern React 19 features (via React Compiler) and Tailwind v4 for a highly animated UI using Framer Motion.

## STRUCTURE
```
.
├── app/               # Next.js App Router entry points (page, layout, globals.css)
├── components/        # Feature-based UI components and layouts
├── lib/               # Shared utilities (cn for Tailwind)
└── providers/         # Global React context providers (Auth)
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Adding routes | `app/` | Single-page app currently (`app/page.tsx`) |
| Creating UI features | `components/<Feature>/` | PascalCase dirs (`Hero/`, `Wallet/`, etc.) |
| Wallet Connection | `components/Wallet/` | Integrates with `sats-connect` |
| Auth/State | `providers/AuthProvider.tsx` | Global authentication state wrapper |
| Styling | `app/globals.css` | Tailwind v4 zero-config CSS |

## CONVENTIONS
- **Imports:** ALWAYS use `@/` alias (e.g., `@/components/...`). No relative `../` paths.
- **Styling:** Use `cn()` from `@/lib/utils` for conditional classes. Avoid raw string concatenation.
- **Tailwind:** This uses v4 (zero-config). Custom configurations go in `app/globals.css` via `@theme`.
- **Memoization:** DO NOT manually use `useMemo` or `useCallback`. The React Compiler (`babel-plugin-react-compiler`) handles this automatically.

## ANTI-PATTERNS (THIS PROJECT)
- Creating top-level component files instead of grouping them in PascalCase feature folders inside `components/`.
- Mixing page layout logic into UI components (e.g., `components/HomePage.tsx` blurs this boundary).

## UNIQUE STYLES
- High reliance on canvas animations (`AntiGravityCanvas.tsx`) and Framer Motion for interactive UI elements.
- Clean, dark-themed UI with glassmorphism effects (`backdrop-blur`).
