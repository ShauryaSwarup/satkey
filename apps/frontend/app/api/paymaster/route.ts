/**
 * AVNU Paymaster Proxy Route
 * 
 * Proxies requests to AVNU's paymaster service.
 * Keeps the API key server-side only.
 * Uses Sepolia for testing.
 */

import { NextRequest, NextResponse } from 'next/server';

const AVNU_PAYMASTER_URL = 'https://sepolia.paymaster.avnu.fi';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(AVNU_PAYMASTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-paymaster-api-key': process.env.AVNU_PAYMASTER_API_KEY || '',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[paymaster] Error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy paymaster request' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
