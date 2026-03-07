import { BridgeFlow } from "@/components/Bridge/BridgeFlow";

export default function BridgePage() {
  return (
    <div className="flex flex-col min-h-screen bg-black pt-24 px-4">
      <div className="max-w-7xl mx-auto w-full">
          <BridgeFlow />
      </div>
    </div>
  );
}
