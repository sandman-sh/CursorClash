import React, { useState, useEffect } from 'react';
import type { WalletProfile } from '../lib/solana';
import { TradingCanvas } from './TradingCanvas';
import { QuickOrderPanel } from './QuickOrderPanel';
import { TradeTape } from './TradeTape';
import { Leaderboard } from './Leaderboard';
import { multiplayerService, type TapFlag } from '../lib/multiplayer';
import { priceFeedService, type MarketStats } from '../lib/priceFeed';
import { Cpu, Activity, BarChart2, Flame, Share2, Check, Lock, Plus, Wallet } from 'lucide-react';

interface ArenaAppProps {
  roomId: string;
  activeProfile: WalletProfile | null;
  onOpenWalletModal: () => void;
  onOpenTelemetry: () => void;
  onOpenPrivateRoomModal: () => void;
}

export const ArenaApp: React.FC<ArenaAppProps> = ({
  roomId,
  activeProfile,
  onOpenWalletModal,
  onOpenTelemetry,
  onOpenPrivateRoomModal,
}) => {
  const [currentPrice, setCurrentPrice] = useState<number>(priceFeedService.getCurrentPrice());
  const [marketStats, setMarketStats] = useState<MarketStats>(priceFeedService.getMarketStats());
  const [stake, setStake] = useState(0.1);
  const [leverage, setLeverage] = useState(25);
  const [allFlags, setAllFlags] = useState<TapFlag[]>([]);
  const [mobileTab, setMobileTab] = useState<'CHART' | 'ORDER' | 'SQUAD'>('CHART');
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    multiplayerService.setRoom(roomId);
    const unsubFlags = multiplayerService.subscribeFlags(setAllFlags);
    const unsubPrice = priceFeedService.subscribePrice((price, stats) => {
      setCurrentPrice(price);
      setMarketStats(stats);
    });

    return () => {
      unsubFlags();
      unsubPrice();
    };
  }, [roomId]);

  const handleShareRoom = () => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}?room=${roomId}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const userFlags = allFlags.filter((f) => f.playerId === activeProfile?.address);

  const roomNames: Record<string, string> = {
    'trench-1': 'SOL/USDC 100X Wicks',
    'trench-2': 'BONK Volatility Arena',
    'trench-3': 'Global Trading Hub',
  };

  const displayName = roomNames[roomId] || `Private Squad: ${roomId}`;

  return (
    <div className="w-full min-h-[calc(100vh-72px)] bg-theme-main text-theme-main p-3 sm:p-5 font-mono select-none transition-colors duration-200">
      <div className="max-w-[1640px] mx-auto flex flex-col gap-4">
        
        {/* Top Arena Battlefield Header Strip */}
        <div className="neo-card p-3 sm:p-4 flex items-center justify-between flex-wrap gap-3">
          
          <div className="flex items-center gap-3">
            <span className="neo-badge neo-badge-green text-xs">
              <span className="pulse-green mr-1" />
              LIVE MULTIPLAYER
            </span>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-black text-base sm:text-lg text-theme-main font-sans tracking-tight">
                  {displayName}
                </h2>
                {roomId.startsWith('squad-') && (
                  <span className="neo-badge neo-badge-yellow text-[9px] py-0 px-1.5 flex items-center gap-1">
                    <Lock size={10} />
                    <span>PRIVATE</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-theme-muted font-bold mt-0.5">
                <span>Program: AvmjRWFevdy6WK7D2towMreTFtMKijCGEKMSK7j9rgSP</span>
                <span>•</span>
                <span className="text-[#00C853] dark:text-[#00FF66]">Sub-50ms Ephemeral Rollup</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 text-xs font-bold flex-wrap">
            <div className="flex items-center gap-1.5 font-mono bg-theme-inner px-2.5 py-1 border border-black shadow-[1px_1px_0px_#000000]">
              <span className="text-theme-muted font-bold">SOL/USD:</span>
              <span className="text-[#00C853] dark:text-[#00FF66] font-black">
                ${currentPrice.toFixed(2)}
              </span>
              <span className={`text-[10px] ${marketStats.change24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {marketStats.change24h >= 0 ? '+' : ''}{marketStats.change24h.toFixed(2)}%
              </span>
            </div>

            <button
              onClick={handleShareRoom}
              className="neo-btn neo-btn-sm neo-btn-green flex items-center gap-1.5 py-1 px-2.5 text-xs font-black"
              title="Copy shareable link for this room"
            >
              {copiedLink ? <Check size={13} /> : <Share2 size={13} />}
              <span>{copiedLink ? 'LINK COPIED' : 'SHARE ROOM'}</span>
            </button>

            <button
              onClick={onOpenPrivateRoomModal}
              className="neo-btn neo-btn-sm neo-btn-dark flex items-center gap-1.5 py-1 px-2.5 text-xs"
              title="Create another private room"
            >
              <Plus size={13} />
              <span>NEW ROOM</span>
            </button>

            <button
              onClick={onOpenTelemetry}
              className="neo-btn neo-btn-sm neo-btn-dark flex items-center gap-1.5 py-1 px-2.5 text-xs"
              title="Open MagicBlock Ephemeral Rollup Diagnostics"
            >
              <Cpu size={13} />
              <span>DIAGNOSTICS</span>
            </button>
          </div>

        </div>

        {/* Mobile View Tab Switcher (Visible on < 1024px screens) */}
        <div className="flex lg:hidden grid-cols-3 gap-2">
          <button
            onClick={() => setMobileTab('CHART')}
            className={`flex-1 neo-btn neo-btn-sm ${mobileTab === 'CHART' ? 'neo-btn-green' : 'neo-btn-dark'}`}
          >
            <BarChart2 size={14} />
            <span>CANVAS CHART</span>
          </button>
          <button
            onClick={() => setMobileTab('ORDER')}
            className={`flex-1 neo-btn neo-btn-sm ${mobileTab === 'ORDER' ? 'neo-btn-green' : 'neo-btn-dark'}`}
          >
            <Activity size={14} />
            <span>QUICK TAP</span>
          </button>
          <button
            onClick={() => setMobileTab('SQUAD')}
            className={`flex-1 neo-btn neo-btn-sm ${mobileTab === 'SQUAD' ? 'neo-btn-green' : 'neo-btn-dark'}`}
          >
            <Flame size={14} />
            <span>FEED & SQUAD</span>
          </button>
        </div>

        {/* Main 3-Column Battlefield Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          
          {/* Left Column: Interactive Candlestick Canvas + Crosshairs + Live Remote Cursors (8 Cols) */}
          <div className={`lg:col-span-8 flex flex-col gap-4 ${mobileTab !== 'CHART' ? 'hidden lg:flex' : 'flex'}`}>
            <TradingCanvas
              activeProfile={activeProfile}
              onOpenWalletModal={onOpenWalletModal}
              currentPrice={currentPrice}
              onPriceUpdate={setCurrentPrice}
              selectedStake={stake}
              selectedLeverage={leverage}
            />
          </div>

          {/* Right Column: Execution Terminal + Live Trade Tape + Squad Leaderboard (4 Cols) */}
          <div className={`lg:col-span-4 flex flex-col gap-4 ${mobileTab === 'CHART' ? 'hidden lg:flex' : 'flex'}`}>
            
            {/* Quick Order Execution Panel */}
            <div className={`${mobileTab === 'SQUAD' ? 'hidden lg:block' : 'block'}`}>
              <QuickOrderPanel
                activeProfile={activeProfile}
                onOpenWalletModal={onOpenWalletModal}
                currentPrice={currentPrice}
                stake={stake}
                onStakeChange={setStake}
                leverage={leverage}
                onLeverageChange={setLeverage}
                userFlags={userFlags}
              />
            </div>

            {/* Live Trade Tape Feed */}
            <div className={`${mobileTab === 'ORDER' ? 'hidden lg:block' : 'block'}`}>
              <TradeTape />
            </div>

            {/* Squad Leaderboard */}
            <div className={`${mobileTab === 'ORDER' ? 'hidden lg:block' : 'block'}`}>
              <Leaderboard />
            </div>

          </div>

        </div>

      </div>

      {/* Strict Wallet Authentication Gate Modal */}
      {(!activeProfile || !activeProfile.isConnected) && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="neo-card p-8 max-w-md w-full text-center flex flex-col items-center gap-5 border-[4px] border-black shadow-[10px_10px_0px_#000000]">
            <div className="w-16 h-16 bg-[#FFE600] border-[3px] border-black flex items-center justify-center text-black shadow-[4px_4px_0px_#000000]">
              <Lock size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-black font-sans uppercase text-theme-main tracking-tight">
                WALLET LOGIN REQUIRED
              </h2>
              <p className="font-mono text-xs text-theme-muted font-bold mt-2 leading-relaxed">
                You must connect an authenticated Solana Devnet wallet (Phantom, Solflare, Backpack, or Instant Burner keypair) to enter the CursorClash Trading Arena.
              </p>
            </div>
            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={onOpenWalletModal}
                className="neo-btn neo-btn-lg neo-btn-green w-full py-3 flex items-center justify-center gap-2 font-black text-sm shadow-[4px_4px_0px_#000000]"
              >
                <Wallet size={18} />
                <span>CONNECT WALLET TO ENTER ARENA</span>
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="neo-btn neo-btn-sm neo-btn-dark w-full py-2 font-bold text-xs"
              >
                <span>RETURN TO HOMEPAGE</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
