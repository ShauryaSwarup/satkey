"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const initialForm = {
  btc_pubkey: "", // leave empty for user to fill
  tx_id: "mock-txid-1234567890abcdef",
  amount: "0.01",
  input_amount: "0.01",
  output_amount: "100",
  fee: "0.0001",
  starknet_address: "0xMOCKSTARKNETADDRESS",
  confirmations: 0,
  swap_state: 3,
  quote_expiry: Date.now() + 3600 * 1000, // 1 hour from now
  swap_type: "BTC_TO_STRK",
};

export default function ActiveSwapsTestForm() {
  const [form, setForm] = useState(initialForm);
  const [swaps, setSwaps] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const supabase = createClient();

  const fetchSwaps = async () => {
    setLoading(true);
    const { data } = await supabase.from("active_swaps").select("*").order("created_at", { ascending: false });
    setSwaps(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchSwaps();
    // eslint-disable-next-line
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((f) => ({
      ...f,
      [name]: name === "confirmations" || name === "swap_state" ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await supabase.from("active_swaps").upsert({ ...form, quote_expiry: Number(form.quote_expiry) });
    setForm(initialForm);
    setSubmitting(false);
    fetchSwaps();
  };

  return (
    <div className="flex flex-col gap-8 w-full mt-20">
      <form onSubmit={handleSubmit} className="bg-white/10 p-4 rounded-xl flex flex-col gap-2">
        <h2 className="text-white font-bold mb-2">Insert/Upsert Test Swap</h2>
        {Object.keys(initialForm).map((key) => (
          <div key={key} className="flex flex-col">
            <label className="text-xs text-white/60" htmlFor={key}>{key}</label>
            <input
              className="rounded px-2 py-1 text-white bg-white/10 focus:bg-white/20 focus:outline-none"
              id={key}
              name={key}
              type={typeof initialForm[key as keyof typeof initialForm] === "number" ? "number" : "text"}
              value={form[key as keyof typeof initialForm]}
              onChange={handleChange}
              required={key !== "confirmations" && key !== "swap_state"}
            />
          </div>
        ))}
        <button
          type="submit"
          className="mt-2 bg-orange-500 text-white rounded px-4 py-2 font-bold"
          disabled={submitting}
        >
          {submitting ? "Submitting..." : "Upsert"}
        </button>
      </form>
      <div>
        <h2 className="text-white font-bold mb-2">Active Swaps</h2>
        {loading ? (
          <p className="text-white">Loading...</p>
        ) : (
          <ul className="space-y-2">
            {swaps.map((swap) => (
              <li key={swap.btc_pubkey} className="text-white bg-white/5 rounded p-2">
                <div className="text-xs">btc_pubkey: {swap.btc_pubkey}</div>
                <div className="text-xs">tx_id: {swap.tx_id}</div>
                <div className="text-xs">amount: {swap.amount}</div>
                <div className="text-xs">confirmations: {swap.confirmations}</div>
                <div className="text-xs">swap_state: {swap.swap_state}</div>
                <div className="text-xs">swap_type: {swap.swap_type}</div>
                <div className="text-xs">created_at: {swap.created_at}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}