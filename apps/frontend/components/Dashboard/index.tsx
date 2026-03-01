"use client";

import { useAuth } from "@/providers/AuthProvider";
import { motion } from "framer-motion";
import { 
  Wallet, 
  ArrowRightLeft, 
  TrendingUp, 
  ArrowDownToLine, 
  ArrowUpFromLine,
  Activity,
  Clock,
  CheckCircle2,
  ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";

// Mock Data
const MOCK_DATA = {
  stakedBtc: "2.45",
  stakedUsd: "$154,320.50",
  apy: "12.5%",
  rewardsBtc: "0.12",
  rewardsUsd: "$7,560.00",
  recentActivity: [
    {
      id: "1",
      type: "stake",
      amount: "0.5 BTC",
      status: "completed",
      date: "2 hours ago",
      txHash: "0x1234...5678"
    },
    {
      id: "2",
      type: "reward",
      amount: "0.01 BTC",
      status: "completed",
      date: "1 day ago",
      txHash: "0x8765...4321"
    },
    {
      id: "3",
      type: "bridge",
      amount: "1.0 BTC",
      status: "pending",
      date: "2 days ago",
      txHash: "0x9876...1234"
    }
  ]
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring" as const,
      stiffness: 100,
      damping: 15
    }
  }
};

export default function Dashboard() {
  const { addresses, network } = useAuth();
  
  // Get the primary address (usually the first one, or specific purpose like payment/ordinals)
  const primaryAddress = addresses?.[0]?.address || "bc1q...mock";
  const shortAddress = `${primaryAddress.slice(0, 6)}...${primaryAddress.slice(-4)}`;

  return (
    <div className="min-h-screen bg-black pt-24 pb-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-orange-500/10 blur-[120px] pointer-events-none rounded-full" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-orange-600/5 blur-[150px] pointer-events-none rounded-full" />

      <motion.div 
        className="max-w-7xl mx-auto relative z-10"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Header Section */}
        <motion.div variants={itemVariants} className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-2 tracking-tight">
              Dashboard
            </h1>
            <p className="text-white/50 text-lg">
              Welcome back. Here&apos;s your staking overview.
            </p>
          </div>
          
          <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md">
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center shadow-[0_0_20px_rgba(249,115,22,0.3)]">
              <Wallet className="text-white h-6 w-6" />
            </div>
            <div>
              <div className="text-sm text-white/50 font-medium mb-1">Connected Wallet</div>
              <div className="flex items-center gap-2">
                <span className="text-white font-mono">{shortAddress}</span>
                <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium border border-green-500/20">
                  {network?.bitcoin?.name || "Mainnet"}
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Main Position Card */}
          <motion.div 
            variants={itemVariants}
            className="lg:col-span-2 relative group"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/20 to-orange-600/20 rounded-3xl blur-xl opacity-50 group-hover:opacity-70 transition-opacity duration-500" />
            <div className="relative h-full bg-black/40 border border-white/10 rounded-3xl p-8 backdrop-blur-xl overflow-hidden">
              {/* Decorative background element */}
              <div className="absolute -right-20 -top-20 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl" />
              
              <div className="flex flex-col h-full justify-between relative z-10">
                <div>
                  <div className="flex items-center gap-2 text-orange-400 mb-2">
                    <TrendingUp className="h-5 w-5" />
                    <span className="font-medium tracking-wide uppercase text-sm">Total Staked Position</span>
                  </div>
                  <div className="flex items-baseline gap-3 mb-1">
                    <span className="text-5xl md:text-7xl font-bold text-white tracking-tighter">
                      {MOCK_DATA.stakedBtc}
                    </span>
                    <span className="text-2xl text-white/50 font-medium">BTC</span>
                  </div>
                  <div className="text-white/40 text-lg">
                    ≈ {MOCK_DATA.stakedUsd}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 mt-10 pt-8 border-t border-white/10">
                  <div>
                    <div className="text-white/50 text-sm mb-1">Current APY</div>
                    <div className="text-2xl font-bold text-green-400">{MOCK_DATA.apy}</div>
                  </div>
                  <div>
                    <div className="text-white/50 text-sm mb-1">Total Rewards</div>
                    <div className="text-2xl font-bold text-white">
                      +{MOCK_DATA.rewardsBtc} <span className="text-white/50 text-lg">BTC</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Quick Actions */}
          <motion.div 
            variants={itemVariants}
            className="flex flex-col gap-4"
          >
            <ActionCard 
              title="Stake More" 
              description="Deposit BTC to earn yield"
              icon={<ArrowDownToLine className="h-6 w-6" />}
              primary
            />
            <ActionCard 
              title="Bridge BTC" 
              description="Move assets to Starknet"
              icon={<ArrowRightLeft className="h-6 w-6" />}
            />
            <ActionCard 
              title="Unstake" 
              description="Withdraw your position"
              icon={<ArrowUpFromLine className="h-6 w-6" />}
            />
          </motion.div>
        </div>

        {/* Recent Activity */}
        <motion.div 
          variants={itemVariants}
          className="bg-white/[0.02] border border-white/5 rounded-3xl p-6 md:p-8 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/5 rounded-xl">
                <Activity className="h-5 w-5 text-white/70" />
              </div>
              <h2 className="text-xl font-semibold text-white">Recent Activity</h2>
            </div>
            <button className="text-sm text-orange-400 hover:text-orange-300 transition-colors flex items-center gap-1">
              View All <ArrowRightLeft className="h-3 w-3" />
            </button>
          </div>

          <div className="space-y-4">
            {MOCK_DATA.recentActivity.map((activity) => (
              <div 
                key={activity.id}
                className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center",
                    activity.type === 'stake' ? "bg-orange-500/20 text-orange-400" :
                    activity.type === 'reward' ? "bg-green-500/20 text-green-400" :
                    "bg-blue-500/20 text-blue-400"
                  )}>
                    {activity.type === 'stake' ? <ArrowDownToLine className="h-5 w-5" /> :
                     activity.type === 'reward' ? <TrendingUp className="h-5 w-5" /> :
                     <ArrowRightLeft className="h-5 w-5" />}
                  </div>
                  <div>
                    <div className="text-white font-medium capitalize">{activity.type}</div>
                    <div className="text-white/40 text-sm flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {activity.date}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-white font-medium">{activity.amount}</div>
                    <div className="flex items-center justify-end gap-1 text-sm">
                      {activity.status === 'completed' ? (
                        <span className="text-green-400 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Completed
                        </span>
                      ) : (
                        <span className="text-yellow-400 flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Pending
                        </span>
                      )}
                    </div>
                  </div>
                  <button className="p-2 text-white/30 hover:text-white transition-colors opacity-0 group-hover:opacity-100">
                    <ExternalLink className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

function ActionCard({ 
  title, 
  description, 
  icon, 
  primary = false 
}: { 
  title: string; 
  description: string; 
  icon: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <button className={cn(
      "flex items-center gap-4 p-5 rounded-2xl text-left transition-all duration-300 group relative overflow-hidden",
      primary 
        ? "bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 border-none shadow-[0_0_30px_rgba(249,115,22,0.2)] hover:shadow-[0_0_40px_rgba(249,115,22,0.4)]" 
        : "bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20"
    )}>
      {primary && (
        <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.2)_50%,transparent_75%)] bg-[length:250%_250%,100%_100%] bg-[position:200%_0,0_0] bg-no-repeat transition-[background-position_0s_ease] hover:bg-[position:-100%_0,0_0] hover:duration-[1500ms]" />
      )}
      
      <div className={cn(
        "h-12 w-12 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110",
        primary ? "bg-white/20 text-white" : "bg-white/5 text-white/70 group-hover:text-white"
      )}>
        {icon}
      </div>
      <div className="relative z-10">
        <div className={cn(
          "font-semibold text-lg mb-0.5",
          primary ? "text-white" : "text-white"
        )}>
          {title}
        </div>
        <div className={cn(
          "text-sm",
          primary ? "text-white/80" : "text-white/50"
        )}>
          {description}
        </div>
      </div>
    </button>
  );
}