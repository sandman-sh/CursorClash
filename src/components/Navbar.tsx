import React, { useState, useEffect, useRef } from 'react';
import { solanaWalletService, type WalletProfile } from '../lib/solana';
import { magicBlockService, type RollupTelemetry } from '../lib/magicblock';
import { useTheme } from '../lib/theme';
import {
  Zap,
  ShieldCheck,
  Wallet,
  ChevronDown,
  Activity,
  ArrowLeft,
  Sun,
  Moon,
  Cpu,
  Copy,
  Check,
  ExternalLink,
  LogOut,
  RefreshCw,
} from 'lucide-react';

interface NavbarProps {
  currentView: 'HOMEPAGE' | 'ARENA';
  onNavigate: (view: 'HOMEPAGE' | 'ARENA') => void;
  onOpenTelemetry: () => void;
  onOpenWalletModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onNavigate,
  onOpenTelemetry,
  onOpenWalletModal,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [profile, setProfile] = useState<WalletProfile | null>(solanaWalletService.getProfile());
  const [telemetry, setTelemetry] = useState<RollupTelemetry>(magicBlockService.getTelemetry());
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isAirdropping, setIsAirdropping] = useState(false);
  const [airdropMsg, setAirdropMsg] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubProfile = solanaWalletService.subscribe(setProfile);
    const unsubTelemetry = magicBlockService.subscribe(setTelemetry);
    return () => {
      unsubProfile();
      unsubTelemetry();
    };
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCopyAddress = () => {
    if (!profile) return;
    navigator.clipboard.writeText(profile.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRequestAirdrop = async () => {
    if (isAirdropping) return;
    setIsAirdropping(true);
    setAirdropMsg(null);

    const res = await solanaWalletService.requestDevnetAirdrop();
    if (res.success) {
      setAirdropMsg('Airdropped +1 SOL!');
    } else {
      setAirdropMsg(res.error || 'Airdrop failed');
    }

    setIsAirdropping(false);
    setTimeout(() => setAirdropMsg(null), 3500);
  };

  return (
    <header className="border-b-[3px] border-black bg-theme-surface sticky top-0 z-40 px-3 sm:px-6 py-3 select-none transition-colors duration-200 w-full shrink-0 shadow-[0_4px_0px_#000000]">
      <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-3 sm:gap-6">
        
        {/* Left: Brand / Logo */}
        <div className="flex items-center gap-3 shrink-0">
          {currentView === 'ARENA' && (
            <button
              onClick={() => onNavigate('HOMEPAGE')}
              className="neo-btn neo-btn-sm neo-btn-dark py-1.5 px-2.5 flex items-center gap-1.5"
              title="Return to Homepage"
            >
              <ArrowLeft size={15} />
              <span className="hidden md:inline font-bold">LOBBY</span>
            </button>
          )}

          <div
            onClick={() => onNavigate('HOMEPAGE')}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-10 h-10 bg-[#00C853] dark:bg-[#00FF66] border-[3px] border-black shadow-[3px_3px_0px_#000000] flex items-center justify-center p-1.5 group-hover:translate-x-0.5 group-hover:translate-y-0.5 group-hover:shadow-[1px_1px_0px_#000000] transition-all">
              <img src="/favicon.svg" alt="CursorClash Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 leading-none">
                <span className="font-extrabold text-xl tracking-tight text-theme-main font-sans">CURSOR</span>
                <span className="font-extrabold text-xl tracking-tight text-[#00C853] dark:text-[#00FF66] font-sans">CLASH</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-black text-[#00FF66] font-extrabold border border-black shadow-[1px_1px_0px_#000000]">
                  v8.0
                </span>
              </div>
              <div className="text-[10px] text-theme-muted font-mono font-bold tracking-wider mt-0.5 flex items-center gap-1.5">
                <span className="pulse-green inline-block" />
                <span>SOLANA DEVNET LIVE</span>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Live MagicBlock Ephemeral Rollup Status Pill */}
        <div
          onClick={onOpenTelemetry}
          className="hidden lg:flex items-center gap-2.5 px-3 py-1 bg-theme-inner border-2 border-black shadow-[2px_2px_0px_#000000] cursor-pointer hover:bg-[#DDE5DD] dark:hover:bg-[#1E281E] transition-all"
          title="Inspect MagicBlock Ephemeral Rollup Telemetry"
        >
          <div className="flex items-center gap-1.5 text-xs font-mono font-black text-theme-main">
            <Zap size={14} className="text-[#00C853] dark:text-[#00FF66] fill-[#00C853]/30" />
            <span>EPHEMERAL ROLLUP:</span>
          </div>
          <span className="neo-badge neo-badge-green text-[10px] py-0 px-1.5">
            DELEGATED
          </span>
          <span className="text-xs font-mono font-bold text-[#00C853] dark:text-[#00FF66]">
            {telemetry.latencyMs}ms
          </span>
          <span className="text-[10px] font-mono text-theme-muted font-bold">
            ({telemetry.totalTapsProcessed} taps)
          </span>
        </div>

        {/* Right: Theme Toggle + Real Solana Wallet Status */}
        <div className="flex items-center gap-2 sm:gap-3">
          
          {/* Theme Switcher Button */}
          <button
            onClick={toggleTheme}
            className="neo-btn neo-btn-sm neo-btn-dark py-1.5 px-2.5 flex items-center gap-1.5"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? (
              <>
                <Sun size={15} className="text-[#FFE600] fill-[#FFE600]/20" />
                <span className="font-extrabold text-xs font-mono">LIGHT</span>
              </>
            ) : (
              <>
                <Moon size={15} className="text-[#00FF66] fill-[#00FF66]/20" />
                <span className="font-extrabold text-xs font-mono">DARK</span>
              </>
            )}
          </button>

          {/* Real Solana Wallet Control */}
          {profile && profile.isConnected ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="neo-btn neo-btn-sm neo-btn-green flex items-center gap-2 py-1.5 px-3 shadow-[3px_3px_0px_#000000]"
                title="View Connected Solana Devnet Wallet"
              >
                <span className="text-sm leading-none">{profile.avatar}</span>
                <span className="font-mono text-xs font-black text-black">
                  {profile.shortAddress}
                </span>
                <span className="font-mono text-[11px] px-1.5 py-0.5 bg-black text-[#00FF66] border border-black font-extrabold">
                  {profile.balanceSol.toFixed(2)} SOL
                </span>
                <ChevronDown size={14} className="text-black" />
              </button>

              {/* Real Wallet Dropdown */}
              {showDropdown && (
                <div className="absolute right-0 mt-2 w-80 bg-theme-surface border-[3px] border-black shadow-[6px_6px_0px_#000000] p-4 z-50 animate-in fade-in zoom-in-95 duration-100">
                  
                  {/* Account Header */}
                  <div className="flex items-center justify-between pb-2 mb-3 border-b-2 border-black text-xs font-mono">
                    <div className="flex items-center gap-1.5">
                      <Activity size={14} className="text-[#00C853] dark:text-[#00FF66]" />
                      <span className="text-theme-main font-black uppercase">
                        {profile.name}
                      </span>
                    </div>
                    <span className="text-[#00C853] dark:text-[#00FF66] font-extrabold text-[10px] bg-black px-1.5 py-0.5 border border-black">
                      SOLANA DEVNET
                    </span>
                  </div>

                  {/* Public Key Display & Copy */}
                  <div className="p-2.5 bg-theme-inner border-2 border-black mb-3 shadow-[2px_2px_0px_#000000]">
                    <div className="text-[10px] text-theme-muted font-bold mb-1">ACCOUNT ADDRESS</div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-mono font-black text-theme-main truncate">
                        {profile.address}
                      </span>
                      <button
                        onClick={handleCopyAddress}
                        className="p-1 hover:bg-theme-surface border border-black text-theme-main shrink-0"
                        title="Copy Solana Address"
                      >
                        {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>

                  {/* Real Balance Box */}
                  <div className="p-3 bg-theme-inner border-2 border-black mb-3 flex items-center justify-between shadow-[2px_2px_0px_#000000]">
                    <div>
                      <div className="text-[10px] text-theme-muted font-bold">DEVNET BALANCE</div>
                      <div className="text-lg font-mono font-black text-[#00C853] dark:text-[#00FF66]">
                        {profile.balanceSol.toFixed(4)} SOL
                      </div>
                    </div>
                    <button
                      onClick={() => solanaWalletService.refreshBalance()}
                      className="p-1.5 hover:bg-theme-surface border border-black text-theme-main"
                      title="Refresh On-Chain Balance"
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>

                  {/* Devnet Airdrop Button */}
                  <button
                    onClick={handleRequestAirdrop}
                    disabled={isAirdropping}
                    className="w-full neo-btn neo-btn-sm neo-btn-green mb-2 py-2 flex items-center justify-center gap-1.5 text-xs font-black"
                  >
                    {isAirdropping ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>AIRDROPPING 1 SOL...</span>
                      </>
                    ) : (
                      <>
                        <Zap size={14} />
                        <span>REQUEST DEVNET AIRDROP (+1 SOL)</span>
                      </>
                    )}
                  </button>

                  {airdropMsg && (
                    <div className="text-[11px] font-mono text-center font-bold text-[#00C853] dark:text-[#00FF66] mb-2">
                      {airdropMsg}
                    </div>
                  )}

                  {/* View on Solana Explorer */}
                  <a
                    href={`https://explorer.solana.com/address/${profile.address}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full p-2 bg-theme-inner hover:bg-theme-surface border-2 border-black flex items-center justify-center gap-1.5 text-xs font-bold text-theme-main mb-2 shadow-[1px_1px_0px_#000000]"
                  >
                    <span>View on Solana Explorer</span>
                    <ExternalLink size={13} />
                  </a>

                  {/* Disconnect Button */}
                  <button
                    onClick={() => {
                      solanaWalletService.disconnect();
                      setShowDropdown(false);
                    }}
                    className="w-full neo-btn neo-btn-sm neo-btn-dark py-1.5 flex items-center justify-center gap-1.5 text-xs font-bold text-red-400"
                  >
                    <LogOut size={13} />
                    <span>DISCONNECT WALLET</span>
                  </button>

                  {/* Footer status inside dropdown */}
                  <div className="mt-3 pt-2 border-t-2 border-black text-[10px] font-mono text-theme-muted flex items-center justify-between font-bold">
                    <div className="flex items-center gap-1">
                      <ShieldCheck size={12} className="text-[#00C853] dark:text-[#00FF66]" />
                      <span>Zero-gas delegated taps</span>
                    </div>
                    <button
                      onClick={() => {
                        setShowDropdown(false);
                        onOpenTelemetry();
                      }}
                      className="text-[#00C853] dark:text-[#00FF66] hover:underline flex items-center gap-1 font-extrabold"
                    >
                      <Cpu size={10} />
                      <span>TELEMETRY</span>
                    </button>
                  </div>

                </div>
              )}
            </div>
          ) : (
            <button
              onClick={onOpenWalletModal}
              className="neo-btn neo-btn-sm neo-btn-green flex items-center gap-2 py-1.5 px-3.5 shadow-[3px_3px_0px_#000000] font-black text-xs"
            >
              <Wallet size={15} />
              <span>CONNECT WALLET</span>
            </button>
          )}

        </div>

      </div>
    </header>
  );
};
