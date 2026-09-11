import React, { useState, useEffect } from 'react';
import { magicBlockService, type RollupTelemetry, type EphemeralTradeEvent } from '../lib/magicblock';
import { Cpu, ShieldCheck, Zap, X, RefreshCw, CheckCircle2, Terminal } from 'lucide-react';

interface RollupTelemetryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RollupTelemetryModal: React.FC<RollupTelemetryModalProps> = ({ isOpen, onClose }) => {
  const [telemetry, setTelemetry] = useState<RollupTelemetry>(magicBlockService.getTelemetry());
  const [history, setHistory] = useState<EphemeralTradeEvent[]>(magicBlockService.getTradeHistory());
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<{ signature: string; committedTrades: number } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = magicBlockService.subscribe((t) => {
      setTelemetry(t);
      setHistory(magicBlockService.getTradeHistory());
    });
    return () => unsub();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCommitL1 = async () => {
    setIsCommitting(true);
    try {
      const result = await magicBlockService.commitToSolanaL1();
      setCommitResult(result);
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 font-mono select-none animate-in fade-in duration-150">
      <div className="neo-card p-5 sm:p-7 w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-[10px_10px_0px_#000000]">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b-[3px] border-black pb-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#00C853] dark:bg-[#00FF66] border-2 border-black flex items-center justify-center text-black shadow-[3px_3px_0px_#000000]">
              <Cpu size={22} />
            </div>
            <div>
              <h3 className="font-black text-base sm:text-lg text-theme-main font-sans tracking-tight">
                MAGICBLOCK EPHEMERAL ROLLUP INSPECTOR
              </h3>
              <p className="text-[11px] text-theme-muted font-bold">
                Live State Delegation & Ephemeral Consensus Telemetry
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

        {/* 4 Status KPI Boxes */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="p-3 bg-theme-inner border-2 border-black shadow-[2px_2px_0px_#000000]">
            <div className="text-[10px] text-theme-muted font-black mb-1">STATE STATUS</div>
            <div className="flex items-center gap-1.5">
              <span className="pulse-green" />
              <span className="text-xs font-black text-[#00C853] dark:text-[#00FF66]">DELEGATED</span>
            </div>
          </div>

          <div className="p-3 bg-theme-inner border-2 border-black shadow-[2px_2px_0px_#000000]">
            <div className="text-[10px] text-theme-muted font-black mb-1">ROUTER PING</div>
            <div className="text-base font-black text-[#00C853] dark:text-[#00FF66]">{telemetry.latencyMs} ms</div>
          </div>

          <div className="p-3 bg-theme-inner border-2 border-black shadow-[2px_2px_0px_#000000]">
            <div className="text-[10px] text-theme-muted font-black mb-1">EPHEMERAL TAPS</div>
            <div className="text-base font-black text-theme-main">{telemetry.totalTapsProcessed}</div>
          </div>

          <div className="p-3 bg-theme-inner border-2 border-black shadow-[2px_2px_0px_#000000]">
            <div className="text-[10px] text-theme-muted font-black mb-1">GAS SAVED</div>
            <div className="text-base font-black text-amber-500 dark:text-[#FFE600]">{telemetry.gasSavedSol} S</div>
          </div>
        </div>

        {/* Technical Router & Program Details */}
        <div className="p-3.5 bg-theme-inner border-2 border-black mb-5 text-xs space-y-2 shadow-[2px_2px_0px_#000000] font-bold">
          <div className="flex justify-between items-center">
            <span className="text-theme-muted">PROGRAM ID (DEVNET):</span>
            <a
              href={`https://explorer.solana.com/address/${telemetry.programId}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              className="text-[#00C853] dark:text-[#00FF66] font-black hover:underline"
            >
              {telemetry.programId.slice(0, 8)}...{telemetry.programId.slice(-8)} ↗
            </a>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-theme-muted">PROGRAM DATA:</span>
            <span className="text-theme-main font-black">NdPtCUw...dFGwXg</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-theme-muted">MAGIC ROUTER ENDPOINT:</span>
            <span className="text-[#00C853] dark:text-[#00FF66] font-black">{telemetry.routerEndpoint}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-theme-muted">ACTIVE VALIDATOR CLUSTER:</span>
            <span className="text-theme-main font-black">mb-validator-devnet-01</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-theme-muted">ANCHOR ER SDK:</span>
            <span className="text-[#00C853] dark:text-[#00FF66] font-black">@magicblock-labs/ephemeral-rollups-sdk@0.17</span>
          </div>
        </div>

        {/* Commit to Solana L1 Section */}
        <div className="p-4 bg-theme-inner border-2 border-black mb-5 shadow-[3px_3px_0px_#000000]">
          <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
            <div>
              <div className="text-xs font-black text-theme-main flex items-center gap-1.5">
                <ShieldCheck size={16} className="text-[#00C853] dark:text-[#00FF66]" />
                <span>SOLANA L1 SETTLEMENT (commit_accounts)</span>
              </div>
              <p className="text-[11px] text-theme-muted font-bold mt-1 max-w-md leading-relaxed">
                Commit finalized tap-trade state and user balances back to Solana L1 ledger with cryptographic proof.
              </p>
            </div>

            <button
              onClick={handleCommitL1}
              disabled={isCommitting}
              className="neo-btn neo-btn-sm neo-btn-green flex items-center gap-1.5 py-2 px-3 font-black text-xs"
            >
              {isCommitting ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>COMMITTING...</span>
                </>
              ) : (
                <>
                  <Zap size={14} />
                  <span>COMMIT TO L1</span>
                </>
              )}
            </button>
          </div>

          {commitResult && (
            <div className="mt-3 p-3 bg-theme-surface border-2 border-black text-xs shadow-[2px_2px_0px_#000000] animate-in fade-in">
              <div className="flex items-center gap-1.5 text-[#00C853] dark:text-[#00FF66] font-black mb-1">
                <CheckCircle2 size={15} />
                <span>State Successfully Committed to Solana L1 Devnet!</span>
              </div>
              <div className="text-[10px] text-theme-muted truncate font-mono font-bold">
                Tx Signature: {commitResult.signature}
              </div>
            </div>
          )}
        </div>

        {/* Recent Ephemeral Rollup Transactions Log */}
        <div>
          <div className="text-xs font-black text-theme-main mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Terminal size={14} className="text-[#00C853] dark:text-[#00FF66]" />
              <span>SESSION EPHEMERAL TRANSACTIONS</span>
            </div>
            <span className="neo-badge neo-badge-dark text-[10px] py-0.5">{history.length} LOGGED</span>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 text-xs">
            {history.length === 0 ? (
              <div className="text-center py-6 text-theme-muted font-bold text-xs bg-theme-inner border border-black">
                No trades placed yet this session. Click the chart to execute taps!
              </div>
            ) : (
              history.map((tx) => (
                <div
                  key={tx.id}
                  className="p-2 bg-theme-inner border border-black flex items-center justify-between text-[11px] shadow-[1px_1px_0px_#000000] font-bold"
                >
                  <div className="flex items-center gap-2">
                    <span className={`font-black ${tx.type === 'LONG' ? 'text-[#00C853] dark:text-[#00FF66]' : 'text-[#E52E5E] dark:text-[#FF3366]'}`}>
                      {tx.type} {tx.leverage}x
                    </span>
                    <span className="text-theme-main font-bold">${tx.targetPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-theme-muted font-bold">{tx.latencyMs}ms</span>
                    <span className="text-[10px] font-mono font-black text-[#00C853] dark:text-[#00FF66]">
                      {tx.signature}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
