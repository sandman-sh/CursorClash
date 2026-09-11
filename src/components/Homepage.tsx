import React, { useState, useEffect } from 'react';
import type { WalletProfile } from '../lib/solana';
import { supabaseService, type DbRoom } from '../lib/supabase';
import { Zap, Flame, Shield, Users, ArrowRight, Play, Sparkles, Wallet, Lock, Plus } from 'lucide-react';

interface HomepageProps {
  onEnterArena: (roomId: string) => void;
  activeProfile: WalletProfile | null;
  onOpenWalletModal: () => void;
  onOpenPrivateRoomModal: () => void;
}

export const Homepage: React.FC<HomepageProps> = ({
  onEnterArena,
  activeProfile,
  onOpenWalletModal,
  onOpenPrivateRoomModal,
}) => {
  const [rooms, setRooms] = useState<DbRoom[]>([
    { id: 'trench-1', name: 'SOL/USDC 100X Wicks', is_private: false },
    { id: 'trench-2', name: 'BONK Volatility Arena', is_private: false },
    { id: 'trench-3', name: 'Global Trading Hub', is_private: false },
  ]);

  useEffect(() => {
    supabaseService.getRooms().then((dbRooms) => {
      if (dbRooms && dbRooms.length > 0) {
        setRooms(dbRooms);
      }
    });
  }, []);

  const steps = [
    {
      num: '01',
      title: 'L1 STATE DELEGATION',
      description:
        "Room and player accounts are created on Solana L1 and delegated to MagicBlock's Ephemeral Rollup validator using the Anchor #[delegate] macro.",
    },
    {
      num: '02',
      title: '60 FPS CURSOR SYNC',
      description:
        "Every trader's cursor position, avatar, and live intentions stream across the candlestick canvas in real time with sub-slot latency.",
    },
    {
      num: '03',
      title: 'SUB-50MS TAP TRADES',
      description:
        'Click anywhere on the chart to plant Long/Short trap flags or 1-click copy squad moves. Taps execute in <20ms with zero gas inside the rollup.',
    },
    {
      num: '04',
      title: 'ATOMIC L1 COMMIT',
      description:
        'When wicks trigger or players exit, final balances and trade PnL are committed back to Solana L1 using commit_and_undelegate() for trustless custody.',
    },
  ];

  return (
    <div className="w-full min-h-screen bg-theme-main text-theme-main transition-colors duration-200 flex flex-col font-sans">
      
      {/* Top Protocol Status Ticker */}
      <div className="ticker-wrap select-none shrink-0 border-b-[3px] border-black">
        <div className="ticker-content">
          <span className="mx-6 font-mono font-black text-xs tracking-wider">⚡ CURSORCLASH MULTIPLAYER TRADING PROTOCOL</span>
          <span className="mx-6 font-mono font-black text-xs tracking-wider">⚔️ 60 FPS CANVAS TAP-TRADING</span>
          <span className="mx-6 font-mono font-black text-xs tracking-wider">🟢 REAL-TIME LIVE MARKET FEED</span>
          <span className="mx-6 font-mono font-black text-xs tracking-wider">💎 ZERO GAS FEES PER TAP</span>
          <span className="mx-6 font-mono font-black text-xs tracking-wider">🧙‍♂️ 1-CLICK COPY & FADE TRADES</span>
          <span className="mx-6 font-mono font-black text-xs tracking-wider">🔒 PROGRAM: AvmjRWFevdy6WK7D2towMreTFtMKijCGEKMSK7j9rgSP</span>
          <span className="mx-6 font-mono font-black text-xs tracking-wider">⚡ PERSISTENT LEADERBOARD BACKED BY SUPABASE</span>
        </div>
      </div>

      {/* Hero Section */}
      <section className="w-full border-b-[3px] border-black bg-grid-pattern py-14 md:py-24 px-4 sm:px-6">
        <div className="max-w-[1440px] mx-auto flex flex-col items-start gap-7">
          
          {/* Tag Badges Row */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="neo-badge neo-badge-green text-xs">
              <Zap size={14} />
              <span>MAGICBLOCK EPHEMERAL ROLLUPS</span>
            </span>
            <span className="neo-badge neo-badge-dark text-xs">
              <Users size={14} />
              <span>REAL-TIME MULTIPLAYER SYNC</span>
            </span>
            <span className="neo-badge neo-badge-yellow text-xs">
              <Shield size={14} />
              <span>SOLANA DEVNET DEPLOYED</span>
            </span>
          </div>

          {/* Main Hero Headline */}
          <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black uppercase tracking-tight leading-[1.02] text-theme-main">
            MULTIPLAYER <br />
            <span className="inline-block bg-[#00C853] dark:bg-[#00FF66] text-black px-4 py-1 border-[3px] border-black shadow-[6px_6px_0px_#000000] -rotate-1 transform my-2">
              CANVAS
            </span>{' '}
            TAP-TRADING <br />
            ON SOLANA
          </h1>

          {/* Subtitle */}
          <p className="font-mono text-base sm:text-lg text-theme-muted max-w-3xl leading-relaxed font-bold">
            See your squad's cursors moving live across real-time candlestick charts. Click anywhere to drop Long and Short Wick Traps. 
            Copy or fade any trader's move in 1 click. Zero gas per tap, sub-50ms execution powered by MagicBlock Ephemeral Rollups.
          </p>

          {/* Action CTAs */}
          <div className="flex items-center gap-4 flex-wrap pt-3">
            <button
              onClick={() => onEnterArena('trench-1')}
              className="neo-btn neo-btn-lg neo-btn-green flex items-center gap-3 text-base sm:text-lg font-black shadow-[6px_6px_0px_#000000]"
            >
              <Play size={20} className="fill-black" />
              <span>ENTER PUBLIC ARENA</span>
              <ArrowRight size={20} />
            </button>

            <button
              onClick={onOpenPrivateRoomModal}
              className="neo-btn neo-btn-lg neo-btn-dark flex items-center gap-2.5 text-sm sm:text-base font-bold shadow-[4px_4px_0px_#000000]"
            >
              <Lock size={18} />
              <span>CREATE PRIVATE ROOM</span>
            </button>

            {activeProfile && activeProfile.isConnected ? (
              <div className="neo-card py-2.5 px-4 flex items-center gap-2.5 font-mono text-sm shadow-[4px_4px_0px_#000000]">
                <span className="text-lg">{activeProfile.avatar}</span>
                <span className="font-black text-theme-main">{activeProfile.shortAddress}</span>
                <span className="text-xs bg-[#00C853] dark:bg-[#00FF66] text-black px-2 py-0.5 font-black border border-black">
                  {activeProfile.balanceSol.toFixed(2)} SOL
                </span>
              </div>
            ) : (
              <button
                onClick={onOpenWalletModal}
                className="neo-btn neo-btn-lg neo-btn-dark flex items-center gap-2.5 text-sm sm:text-base font-bold shadow-[4px_4px_0px_#000000]"
              >
                <Wallet size={18} />
                <span>CONNECT SOLANA WALLET</span>
              </button>
            )}
          </div>

          {/* Live System Metrics Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full pt-6">
            <div className="neo-card p-5">
              <div className="text-[10px] font-mono text-theme-muted font-black uppercase tracking-wider">ROLLUP LATENCY</div>
              <div className="text-2xl sm:text-3xl font-black text-[#00C853] dark:text-[#00FF66] font-mono my-1">
                &lt; 20ms
              </div>
              <div className="text-[10px] text-theme-muted font-mono font-bold flex items-center gap-1.5 mt-1">
                <span className="pulse-green" />
                <span>devnet-router.magicblock.app</span>
              </div>
            </div>

            <div className="neo-card p-5">
              <div className="text-[10px] font-mono text-theme-muted font-black uppercase tracking-wider">GAS PER TAP</div>
              <div className="text-2xl sm:text-3xl font-black text-theme-main font-mono my-1">
                $0.00
              </div>
              <div className="text-[10px] text-[#00C853] dark:text-[#00FF66] font-mono font-black mt-1">
                100% Free Ephemeral Taps
              </div>
            </div>

            <div className="neo-card p-5">
              <div className="text-[10px] font-mono text-theme-muted font-black uppercase tracking-wider">CANVAS FRAME RATE</div>
              <div className="text-2xl sm:text-3xl font-black text-amber-500 dark:text-[#FFE600] font-mono my-1">
                60 FPS
              </div>
              <div className="text-[10px] text-theme-muted font-mono font-bold mt-1">
                Sub-slot peer cursor mesh
              </div>
            </div>

            <div className="neo-card p-5">
              <div className="text-[10px] font-mono text-theme-muted font-black uppercase tracking-wider">DATABASE SYNC</div>
              <div className="text-2xl sm:text-3xl font-black text-cyan-600 dark:text-[#00F0FF] font-mono my-1">
                SUPABASE
              </div>
              <div className="text-[10px] text-theme-muted font-mono font-bold mt-1">
                Persistent SQL Leaderboards
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Battle Rooms Selector */}
      <section className="w-full py-14 px-4 sm:px-6 bg-theme-surface border-b-[3px] border-black">
        <div className="max-w-[1440px] mx-auto flex flex-col gap-8">
          
          <div className="flex items-center justify-between flex-wrap gap-4 border-b-2 border-black pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Flame size={20} className="text-[#00C853] dark:text-[#00FF66]" />
                <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-theme-main">
                  ACTIVE TRADING ROOMS
                </h2>
              </div>
              <p className="text-xs sm:text-sm font-mono text-theme-muted font-bold mt-1">
                Select a public arena or create a private room for your squad.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onOpenPrivateRoomModal}
                className="neo-btn neo-btn-sm neo-btn-green py-2 px-3 flex items-center gap-1.5 text-xs font-black"
              >
                <Plus size={14} />
                <span>NEW PRIVATE ROOM</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {rooms.map((room) => (
              <div
                key={room.id}
                className="neo-card p-6 flex flex-col justify-between gap-5 relative group hover:-translate-y-1 transition-transform"
              >
                {room.is_private && (
                  <div className="absolute -top-3 right-6 bg-[#FFE600] text-black border-2 border-black px-2.5 py-0.5 font-mono text-[10px] font-black tracking-wider shadow-[2px_2px_0px_#000000] flex items-center gap-1">
                    <Lock size={10} />
                    <span>PRIVATE SQUAD</span>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-xs font-black text-theme-muted">
                      SOL / USD
                    </span>
                    <span className="neo-badge neo-badge-green text-[10px]">
                      {room.is_private ? 'PRIVATE SQUAD' : 'PUBLIC ARENA'}
                    </span>
                  </div>

                  <h3 className="font-black text-lg text-theme-main mb-2 font-sans tracking-tight">
                    {room.name}
                  </h3>

                  <p className="font-mono text-xs text-theme-muted leading-relaxed font-bold mb-4">
                    Real-time candlestick canvas with sub-50ms ephemeral state mutations and instant peer synchronization.
                  </p>

                  <div className="grid grid-cols-2 gap-2 font-mono text-xs p-3 bg-theme-inner border-2 border-black">
                    <div>
                      <span className="text-theme-muted text-[10px] block font-bold">STATE</span>
                      <span className="font-black text-theme-main">LIVE</span>
                    </div>
                    <div>
                      <span className="text-theme-muted text-[10px] block font-bold">ROLLUP LATENCY</span>
                      <span className="font-black text-[#00C853] dark:text-[#00FF66]">&lt; 20ms</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => onEnterArena(room.id)}
                  className="w-full neo-btn neo-btn-green py-2.5 flex items-center justify-center gap-2 font-black text-xs shadow-[3px_3px_0px_#000000]"
                >
                  <span>JOIN ARENA</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* Architecture Section */}
      <section className="w-full py-16 px-4 sm:px-6 bg-theme-main">
        <div className="max-w-[1440px] mx-auto flex flex-col gap-10">
          
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-amber-500 dark:text-[#FFE600]" />
              <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-theme-main">
                MAGICBLOCK EPHEMERAL ROLLUP ARCHITECTURE
              </h2>
            </div>
            <p className="font-mono text-xs sm:text-sm text-theme-muted font-bold mt-1">
              How CursorClash achieves 60 FPS multiplayer sync and zero gas per tap on Solana.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((s) => (
              <div key={s.num} className="neo-card p-6 flex flex-col gap-3">
                <span className="font-mono font-black text-3xl sm:text-4xl text-[#00C853] dark:text-[#00FF66]">
                  {s.num}
                </span>
                <h4 className="font-black text-base text-theme-main font-sans tracking-tight">
                  {s.title}
                </h4>
                <p className="font-mono text-xs text-theme-muted leading-relaxed font-bold">
                  {s.description}
                </p>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* Bottom Footer */}
      <footer className="w-full border-t-[3px] border-black bg-theme-surface py-6 px-4 sm:px-6 font-mono text-xs text-theme-muted font-bold">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <span className="font-black text-theme-main">CURSORCLASH TRADING PROTOCOL</span>
            <span>•</span>
            <span>SOLANA DEVNET & MAGICBLOCK ROLLUPS</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://explorer.solana.com/address/AvmjRWFevdy6WK7D2towMreTFtMKijCGEKMSK7j9rgSP?cluster=devnet"
              target="_blank"
              rel="noreferrer"
              className="text-[#00C853] dark:text-[#00FF66] hover:underline font-black"
            >
              Solana Devnet Contract ↗
            </a>
            <a
              href="https://magicblock.gg"
              target="_blank"
              rel="noreferrer"
              className="hover:text-theme-main hover:underline"
            >
              MagicBlock Docs ↗
            </a>
          </div>
        </div>
      </footer>

    </div>
  );
};
