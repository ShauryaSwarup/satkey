# APP DIRECTORY

**Scope:** Next.js App Router entry points only. All UI logic lives in `components/`.

## OVERVIEW
This directory owns routing, global layout, fonts, metadata, and base CSS. Nothing else.

## WHERE TO LOOK

| File | Purpose |
|------|---------|
| `layout.tsx` | Root layout: HTML shell, font injection (`Geist`, `Geist_Mono`), global metadata |
| `page.tsx` | Single route (`/`): composes `Navigation` + `HomePage`, no logic of its own |
| `globals.css` | Tailwind v4 import + CSS custom properties (`--background`, `--foreground`) |
| `favicon.ico` | App icon asset |

## CONVENTIONS
- `page.tsx` should stay a thin shell. Import from `components/`, render, done.
- All `<Metadata>` exports belong in `layout.tsx` (or per-page if routes expand).
- New global CSS tokens go in `globals.css` under `:root` as CSS custom properties, not as Tailwind config.
- New routes get their own `app/<route>/page.tsx`. Don't add route logic to the root `page.tsx`.
- Fonts are loaded via `next/font/google` in `layout.tsx` and exposed as CSS variables (`--font-geist-sans`, `--font-geist-mono`). Add new fonts the same way.

## ANTI-PATTERNS
- **Don't put components here.** Even small, one-off UI bits belong in `components/`, not `app/`.
- **Don't import from `app/` inside `components/`.** This directory is a consumer of components, not a provider.
- **Don't hardcode colors or font values in `layout.tsx` or `page.tsx`.** Use CSS variables defined in `globals.css`.
- **Don't add providers here without updating `providers/`.** Auth and context wrappers live in `providers/AuthProvider.tsx`, not scattered in layout files.
- **Don't grow `page.tsx` into a feature file.** If it needs state, effects, or more than two component imports, the logic belongs in a component.
