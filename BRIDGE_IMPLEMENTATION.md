# Bridge Swap Persistence Implementation

## Changes Made

### 1. Database Schema
- **File**: `supabase/migrations/001_active_swaps.sql`
- Created `active_swaps` table with `btc_pubkey` as primary key
- Stores: tx_id, amounts, fees, confirmations, swap_state, timestamps
- Auto-updates `updated_at` on row changes

### 2. Environment Variables
- **File**: `apps/frontend/.env.example`
- Added:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 3. Supabase Client
- **File**: `apps/frontend/lib/supabase.ts`
- Exports configured Supabase client
- Defines `ActiveSwap` TypeScript interface

### 4. New Components

#### BridgeInput (`components/Bridge/BridgeInput.tsx`)
- Handles amount input and quote fetching
- Reusable input form component

#### ActiveSwapsList (`components/Bridge/ActiveSwapsList.tsx`)
- Displays list of ongoing swaps
- Shows confirmations and tx links
- Click to view swap progress

#### SwapProgress (`components/Bridge/SwapProgress.tsx`)
- Shows 3-stage progress (Broadcasted → Confirmed → Claimed)
- Circular progress indicator
- Manual claim button if needed

### 5. Refactored BridgeFlow
- **File**: `components/Bridge/BridgeFlow.tsx`
- Added `view` state: "new" | "active"
- Fetches active swaps on mount
- Stores swap to Supabase on `onSourceTransactionSent`
- Updates confirmations and state in real-time
- Clicking active swap shows progress view

### 6. Package Dependencies
- **File**: `apps/frontend/package.json`
- Added `@supabase/supabase-js: ^2.48.1`

## Setup Instructions

1. **Install dependencies**:
   ```bash
   cd apps/frontend
   pnpm install
   ```

2. **Setup Supabase**:
   - Create Supabase project
   - Run migration: `supabase/migrations/001_active_swaps.sql`
   - Copy URL and anon key to `.env.local`

3. **Configure environment**:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   ```

## Features

✅ Active swaps persist across page refreshes
✅ Active swaps persist across wallet disconnects
✅ Shows list of ongoing swaps
✅ Click swap to view 3-stage progress
✅ Real-time updates to Supabase
✅ Clean component separation
✅ Existing theme maintained
