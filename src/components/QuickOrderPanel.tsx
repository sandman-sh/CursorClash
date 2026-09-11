import React, { useState } from 'react';
import { solanaWalletService, type WalletProfile } from '../lib/solana';
import { multiplayerService, type TapFlag } from '../lib/multiplayer';
import { magicBlockService } from '../lib/magicblock';
import { Zap, TrendingUp, TrendingDown, Target, Wallet, ExternalLink } from 'lucide-react';

interface QuickOrderPanelProps {
  activeProfile: WalletProfile | null;
  onOpenWalletModal: () => void;
  currentPrice: number;
  stake: number;
  onStakeChange: (s: number) => void;
  leverage: number;
  onLeverageChange: (l: number) => void;
  userFlags: TapFlag[];
}

export const QuickOrderPanel: React.FC<QuickOrderPanelProps> = ({
  activeProfile,
  onOpenWalletModal,
  currentPrice,
  stake,
  onStakeChange,
  leverage,
  onLeverageChange,
  userFlags,
}) => {
  const STAKE_PRESETS = [0.1, 0.5, 1.0, 2.5];
  const LEVERAGE_PRESETS = [10, 25, 50, 100];
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleQuickMarketTap = async (type: 'LONG' | 'SHORT') => {
    if (!activeProfile || !activeProfile.isConnected) {
      onOpenWalletModal();
      return;
    }

    if (activeProfile.balanceSol < stake) {
      setErrorMessage(`Insufficient balance (${activeProfile.balanceSol} SOL). You need at least ${stake} SOL to stake!`);
      setTimeout(() => setErrorMessage(null), 5000);
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    setStatusMessage('Preparing on-chain transaction...');

    try {
      const targetPrice = type === 'LONG' ? currentPrice + 0.45 : currentPrice - 0.45;
      const roomId = multiplayerService.getRoom();

      const erEvent = await magicBlockService.submitEphemeralTap({
        playerPubkey: activeProfile.address,
        roomId,
        type,
        targetPrice,
        stakeSol: stake,
        leverage,
        onStatus: (status) => setStatusMessage(status),
      });

      setStatusMessage('Confirmed on Solana Devnet!');

      const newFlag: TapFlag = {
        id: erEvent.id,
        roomId,
        playerId: activeProfile.address,
        playerName: activeProfile.shortAddress,
        playerAvatar: activeProfile.avatar,
        playerColor: activeProfile.color,
        type,
        price: targetPrice,
        stakeSol: stake,
        leverage,
        timestamp: Date.now(),
        copiedCount: 0,
        status: 'PENDING',
        txSignature: erEvent.signature,
      };

      multiplayerService.broadcastFlag(newFlag);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      console.error('On-chain tap error:', err);
      setErrorMessage(err?.message || 'Transaction was cancelled or rejected');
      setTimeout(() => setErrorMessage(null), 6000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const activePendingFlags = userFlags.filter((f) => f.status === 'PENDING');

  return (
    <div className="neo-card p-5 sm:p-6 flex flex-col gap-4 font-mono select-none">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-black pb-2.5 mb-1 shrink-0">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-[#00C853] dark:text-[#00FF66]" />
          <span className="font-black text-sm text-theme-main font-sans">EXECUTION TERMINAL</span>
        </div>
        <span className="neo-badge neo-badge-green text-[10px] py-0.5">
          SUB-50MS TAP
        </span>
      </div>

      {/* Stake Size Selector */}
      <div>
        <div className="flex justify-between text-xs font-bold mb-1.5">
          <span className="text-theme-muted">STAKE AMOUNT:</span>
          <span className="text-[#00C853] dark:text-[#00FF66] font-black">{stake} SOL</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {STAKE_PRESETS.map((s) => (
            <button
              key={s}
              onClick={() => onStakeChange(s)}
              className={`py-1.5 px-2 border-2 border-black text-xs font-extrabold transition-all ${
                stake === s
                  ? 'bg-[#00C853] dark:bg-[#00FF66] text-black shadow-[2px_2px_0px_#000000]'
                  : 'bg-theme-inner text-theme-main hover:bg-[#DDE5DD] dark:hover:bg-[#1E281E]'
              }`}
            >
              {s} SOL
            </button>
          ))}
        </div>
      </div>

      {/* Multiplier / Leverage Selector */}
      <div>
        <div className="flex justify-between text-xs font-bold mb-1.5">
          <span className="text-theme-muted">DEGEN MULTIPLIER:</span>
          <span className="text-amber-500 dark:text-[#FFE600] font-black">{leverage}x</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {LEVERAGE_PRESETS.map((l) => (
            <button
              key={l}
              onClick={() => onLeverageChange(l)}
              className={`py-1.5 px-2 border-2 border-black text-xs font-extrabold transition-all ${
                leverage === l
                  ? 'bg-amber-500 dark:bg-[#FFE600] text-black shadow-[2px_2px_0px_#000000]'
                  : 'bg-theme-inner text-theme-main hover:bg-[#DDE5DD] dark:hover:bg-[#1E281E]'
              }`}
            >
              {l}x
            </button>
          ))}
        </div>
      </div>

      {/* Live Transaction Status Alert */}
      {statusMessage && (
        <div className="p-2.5 bg-[#00C853]/15 dark:bg-[#00FF66]/15 border-2 border-[#00C853] dark:border-[#00FF66] text-[#009639] dark:text-[#00FF66] text-xs font-black flex items-center gap-2">
          <Zap size={14} className="animate-spin" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Error / Insufficient Funds Alert */}
      {errorMessage && (
        <div className="p-2.5 bg-[#FF3366]/15 border-2 border-[#FF3366] text-[#FF3366] text-xs font-bold flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <span>⚠️</span>
            <span>{errorMessage}</span>
          </div>
          {activeProfile && activeProfile.balanceSol < stake && (
            <button
              onClick={async () => {
                setStatusMessage('Requesting testnet SOL from protocol faucet...');
                const res = await solanaWalletService.requestDevnetAirdrop();
                if (res.success) {
                  setErrorMessage(null);
                  setStatusMessage('Airdrop confirmed! +0.5 SOL added to your balance.');
                  setTimeout(() => setStatusMessage(null), 3500);
                } else {
                  setStatusMessage(null);
                  setErrorMessage(res.error || 'Faucet failed. Try solfaucet.com');
                }
              }}
              className="neo-btn neo-btn-green py-1 px-2.5 text-[11px] font-black self-start"
            >
              ⚡ AIRDROP TESTNET SOL (+0.5 SOL)
            </button>
          )}
        </div>
      )}

      {/* Large Quick Tap Buy / Sell Buttons */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <button
          onClick={() => handleQuickMarketTap('LONG')}
          disabled={isSubmitting}
          className="neo-btn neo-btn-green py-3 flex flex-col items-center justify-center gap-1 shadow-[4px_4px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5"
        >
          <div className="flex items-center gap-1.5 font-black text-sm">
            <TrendingUp size={16} />
            <span>TAP LONG</span>
          </div>
          <span className="text-[10px] font-bold opacity-80 font-mono">
            &gt; ${(currentPrice + 0.45).toFixed(2)}
          </span>
        </button>

        <button
          onClick={() => handleQuickMarketTap('SHORT')}
          disabled={isSubmitting}
          className="neo-btn neo-btn-red py-3 flex flex-col items-center justify-center gap-1 shadow-[4px_4px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5"
        >
          <div className="flex items-center gap-1.5 font-black text-sm">
            <TrendingDown size={16} />
            <span>TAP SHORT</span>
          </div>
          <span className="text-[10px] font-bold opacity-80 font-mono">
            &lt; ${(currentPrice - 0.45).toFixed(2)}
          </span>
        </button>
      </div>

      {/* User's Active Flags List */}
      <div className="pt-2 border-t-2 border-black">
        <div className="flex items-center justify-between text-xs font-bold mb-2">
          <span className="text-theme-muted">YOUR ACTIVE TRAPS:</span>
          <span className="text-theme-main font-black">
            {activePendingFlags.length} PENDING
          </span>
        </div>

        {activePendingFlags.length === 0 ? (
          <div className="p-3 bg-theme-inner border-2 border-black text-center text-xs text-theme-muted font-bold">
            No active wick traps. Tap anywhere on the chart or buttons above!
          </div>
        ) : (
          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {activePendingFlags.map((flag) => (
              <div
                key={flag.id}
                className="p-2 bg-theme-inner border-2 border-black flex items-center justify-between text-xs shadow-[2px_2px_0px_#000000]"
              >
                <div className="flex items-center gap-1.5 font-bold">
                  <span
                    className={`font-black text-[11px] px-1 py-0.5 border border-black ${
                      flag.type === 'LONG'
                        ? 'bg-[#00C853] dark:bg-[#00FF66] text-black'
                        : 'bg-[#FF3366] text-white'
                    }`}
                  >
                    {flag.leverage}x {flag.type}
                  </span>
                  <span className="text-theme-main font-black">${flag.price.toFixed(2)}</span>
                </div>
                <div className="text-right flex flex-col items-end">
                  <span className="text-theme-muted font-extrabold">{flag.stakeSol} SOL</span>
                  {flag.txSignature && (
                    <a
                      href={`https://explorer.solana.com/tx/${flag.txSignature}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[9px] text-[#00C853] dark:text-[#00FF66] underline hover:opacity-80 flex items-center gap-0.5 mt-0.5"
                    >
                      <span>Explorer</span>
                      <ExternalLink size={8} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Wallet Connection Helper */}
      {(!activeProfile || !activeProfile.isConnected) && (
        <button
          onClick={onOpenWalletModal}
          className="w-full neo-btn neo-btn-dark py-2 text-xs font-bold flex items-center justify-center gap-2"
        >
          <Wallet size={14} />
          <span>CONNECT WALLET TO TRADE</span>
        </button>
      )}

      {/* Status Bar */}
      <div className="flex items-center justify-between text-[11px] text-theme-muted font-bold pt-1">
        <span className="flex items-center gap-1">
          <Zap size={12} className="text-[#00C853] dark:text-[#00FF66]" />
          <span>On-Chain Solana Devnet</span>
        </span>
        <span className="text-[#00C853] dark:text-[#00FF66] font-black">REAL TEST SOL</span>
      </div>

    </div>
  );
};
