import React, { useEffect, useState } from 'react';
import { multiplayerService, type TapeEntry } from '../lib/multiplayer';
import { Activity, ExternalLink } from 'lucide-react';

export const TradeTape: React.FC = () => {
  const [tape, setTape] = useState<TapeEntry[]>([]);

  useEffect(() => {
    const unsub = multiplayerService.subscribeTape(setTape);
    return () => unsub();
  }, []);

  return (
    <div className="neo-card p-5 sm:p-6 flex flex-col gap-4 font-mono select-none">
      
      {/* Tape Header */}
      <div className="flex items-center justify-between border-b-2 border-black pb-2.5 mb-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-[#00C853] dark:text-[#00FF66]" />
          <span className="font-black text-sm text-theme-main font-sans">LIVE TRADE TAPE</span>
        </div>
        <span className="neo-badge neo-badge-dark text-[10px] py-0.5 flex items-center gap-1.5">
          <span className="pulse-green" />
          <span>&lt;25MS FEED</span>
        </span>
      </div>

      {/* Tape Items Feed */}
      <div className="overflow-y-auto space-y-2 pr-1 max-h-64 sm:max-h-72 min-h-48">
        {tape.length === 0 ? (
          <div className="text-xs text-theme-muted font-bold text-center py-8 bg-theme-inner border border-black">
            Waiting for squad taps...
          </div>
        ) : (
          tape.map((entry) => (
            <div
              key={entry.id}
              className="p-2.5 bg-theme-inner border-2 border-black text-xs transition-transform hover:translate-x-1 shadow-[2px_2px_0px_#000000]"
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <span className="text-sm">{entry.playerAvatar}</span>
                  <span className="text-theme-main font-black text-xs">{entry.playerName}</span>
                </div>
                <span className="text-[10px] text-theme-muted font-bold">
                  {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span
                  className="font-black text-[11px] tracking-wide"
                  style={{ color: entry.color }}
                >
                  {entry.action.replace('_', ' ')}
                </span>
                {entry.pnl !== undefined && (
                  <span className={`text-[10px] font-black px-1.5 py-0.5 border border-black ${
                    entry.pnl >= 0
                      ? 'bg-[#00C853] dark:bg-[#00FF66] text-black'
                      : 'bg-[#E52E5E] dark:bg-[#FF3366] text-white'
                  }`}>
                    {entry.pnl >= 0 ? `+${entry.pnl}` : entry.pnl} SOL
                  </span>
                )}
              </div>

              <div className="text-[10px] text-theme-muted font-bold mt-1 truncate">
                {entry.detail}
              </div>

              {entry.txSignature && (
                <div className="mt-1 pt-1 border-t border-black/10 dark:border-white/10 flex items-center justify-between">
                  <span className="text-[9px] font-mono text-theme-muted">ON-CHAIN DEVNET</span>
                  <a
                    href={`https://explorer.solana.com/tx/${entry.txSignature}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[9px] font-bold text-[#00C853] dark:text-[#00FF66] hover:underline flex items-center gap-0.5"
                  >
                    <span>View Tx</span>
                    <ExternalLink size={8} />
                  </a>
                </div>
              )}
            </div>
          ))
        )}
      </div>

    </div>
  );
};
