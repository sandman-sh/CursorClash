import React, { useState } from 'react';
import { solanaWalletService } from '../lib/solana';
import { X, Wallet, Zap, ShieldCheck, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WalletModal: React.FC<WalletModalProps> = ({ isOpen, onClose }) => {
  const [loadingType, setLoadingType] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConnect = async (type: 'PHANTOM' | 'SOLFLARE' | 'BACKPACK' | 'BURNER') => {
    setLoadingType(type);
    setErrorMessage(null);

    try {
      if (type === 'PHANTOM') {
        await solanaWalletService.connectPhantom();
      } else if (type === 'SOLFLARE') {
        await solanaWalletService.connectSolflare();
      } else if (type === 'BACKPACK') {
        await solanaWalletService.connectBackpack();
      } else if (type === 'BURNER') {
        await solanaWalletService.connectBurnerWallet();
      }
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to connect wallet');
    } finally {
      setLoadingType(null);
    }
  };

  const anyWin = typeof window !== 'undefined' ? (window as any) : {};
  const hasPhantom = !!anyWin.solana?.isPhantom;
  const hasSolflare = !!anyWin.solflare?.isSolflare;
  const hasBackpack = !!anyWin.backpack;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 font-mono select-none animate-in fade-in duration-150">
      <div className="neo-card p-5 sm:p-7 w-full max-w-lg shadow-[10px_10px_0px_#000000]">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b-[3px] border-black pb-3 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-[#00C853] dark:bg-[#00FF66] border-2 border-black flex items-center justify-center text-black shadow-[2px_2px_0px_#000000]">
              <Wallet size={20} />
            </div>
            <div>
              <h3 className="font-black text-lg text-theme-main font-sans tracking-tight">
                CONNECT SOLANA WALLET
              </h3>
              <p className="text-[11px] text-theme-muted font-bold">
                Solana Devnet • Real On-Chain Ephemeral Trading
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-theme-muted hover:text-theme-main hover:bg-theme-inner border-2 border-transparent hover:border-black transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {errorMessage && (
          <div className="p-3 mb-4 bg-red-500/10 border-2 border-red-500 text-red-500 text-xs font-bold flex items-start gap-2 shadow-[2px_2px_0px_#000000]">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <div className="flex-1">{errorMessage}</div>
          </div>
        )}

        {/* Wallets List */}
        <div className="space-y-2.5 mb-5">
          {/* Phantom */}
          <button
            onClick={() => handleConnect('PHANTOM')}
            disabled={loadingType !== null}
            className="w-full p-3.5 bg-theme-inner hover:bg-[#DDE5DD] dark:hover:bg-[#1E281E] border-2 border-black flex items-center justify-between transition-all hover:translate-x-1 shadow-[3px_3px_0px_#000000] text-left group"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">👻</span>
              <div>
                <div className="font-extrabold text-sm text-theme-main font-sans">
                  Phantom Wallet
                </div>
                <div className="text-[11px] text-theme-muted font-bold">
                  {hasPhantom ? 'Extension Detected & Ready' : 'Install Phantom browser extension'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {loadingType === 'PHANTOM' ? (
                <RefreshCw size={18} className="animate-spin text-theme-main" />
              ) : hasPhantom ? (
                <span className="neo-badge neo-badge-green text-[10px] py-0.5">CONNECT</span>
              ) : (
                <ExternalLink size={16} className="text-theme-muted group-hover:text-theme-main" />
              )}
            </div>
          </button>

          {/* Solflare */}
          <button
            onClick={() => handleConnect('SOLFLARE')}
            disabled={loadingType !== null}
            className="w-full p-3.5 bg-theme-inner hover:bg-[#DDE5DD] dark:hover:bg-[#1E281E] border-2 border-black flex items-center justify-between transition-all hover:translate-x-1 shadow-[3px_3px_0px_#000000] text-left group"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">☀️</span>
              <div>
                <div className="font-extrabold text-sm text-theme-main font-sans">
                  Solflare Wallet
                </div>
                <div className="text-[11px] text-theme-muted font-bold">
                  {hasSolflare ? 'Extension Detected & Ready' : 'Install Solflare browser extension'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {loadingType === 'SOLFLARE' ? (
                <RefreshCw size={18} className="animate-spin text-theme-main" />
              ) : hasSolflare ? (
                <span className="neo-badge neo-badge-green text-[10px] py-0.5">CONNECT</span>
              ) : (
                <ExternalLink size={16} className="text-theme-muted group-hover:text-theme-main" />
              )}
            </div>
          </button>

          {/* Backpack */}
          <button
            onClick={() => handleConnect('BACKPACK')}
            disabled={loadingType !== null}
            className="w-full p-3.5 bg-theme-inner hover:bg-[#DDE5DD] dark:hover:bg-[#1E281E] border-2 border-black flex items-center justify-between transition-all hover:translate-x-1 shadow-[3px_3px_0px_#000000] text-left group"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🎒</span>
              <div>
                <div className="font-extrabold text-sm text-theme-main font-sans">
                  Backpack Wallet
                </div>
                <div className="text-[11px] text-theme-muted font-bold">
                  {hasBackpack ? 'Extension Detected & Ready' : 'Install Backpack browser extension'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {loadingType === 'BACKPACK' ? (
                <RefreshCw size={18} className="animate-spin text-theme-main" />
              ) : hasBackpack ? (
                <span className="neo-badge neo-badge-green text-[10px] py-0.5">CONNECT</span>
              ) : (
                <ExternalLink size={16} className="text-theme-muted group-hover:text-theme-main" />
              )}
            </div>
          </button>

          {/* Instant Devnet Burner Keypair */}
          <div className="pt-2">
            <div className="text-[11px] font-mono text-theme-muted mb-2 font-bold uppercase tracking-wider">
              No Browser Extension?
            </div>
            <button
              onClick={() => handleConnect('BURNER')}
              disabled={loadingType !== null}
              className="w-full p-3.5 bg-[#00C853]/10 dark:bg-[#00FF66]/10 hover:bg-[#00C853]/20 dark:hover:bg-[#00FF66]/20 border-2 border-black flex items-center justify-between transition-all hover:translate-x-1 shadow-[3px_3px_0px_#000000] text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#00C853] dark:bg-[#00FF66] text-black border border-black flex items-center justify-center">
                  <Zap size={18} />
                </div>
                <div>
                  <div className="font-extrabold text-sm text-theme-main font-sans flex items-center gap-1.5">
                    <span>Instant Devnet Burner Keypair</span>
                    <span className="neo-badge neo-badge-yellow text-[9px] py-0 px-1">FAST</span>
                  </div>
                  <div className="text-[11px] text-theme-muted font-bold">
                    Generates a real on-chain keypair in local storage with 1-click Devnet faucet
                  </div>
                </div>
              </div>
              <div>
                {loadingType === 'BURNER' ? (
                  <RefreshCw size={18} className="animate-spin text-theme-main" />
                ) : (
                  <span className="neo-btn neo-btn-sm neo-btn-green py-1 px-2 text-xs font-black">
                    START
                  </span>
                )}
              </div>
            </button>
          </div>
        </div>

        {/* Footer Note */}
        <div className="pt-3 border-t-2 border-black flex items-center justify-between text-[11px] font-mono text-theme-muted font-bold">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-[#00C853] dark:text-[#00FF66]" />
            <span>Never prompts for private keys on mainnet</span>
          </div>
          <span className="text-black dark:text-[#00FF66] font-extrabold">DEVNET ONLY</span>
        </div>

      </div>
    </div>
  );
};
