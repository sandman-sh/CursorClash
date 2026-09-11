import React, { useRef, useEffect, useState, useCallback } from 'react';
import { multiplayerService, type RemoteCursor, type TapFlag } from '../lib/multiplayer';
import { magicBlockService } from '../lib/magicblock';
import { priceFeedService, type Candle } from '../lib/priceFeed';
import type { WalletProfile } from '../lib/solana';
import { useTheme } from '../lib/theme';
import confetti from 'canvas-confetti';
import { Copy, X, Wallet } from 'lucide-react';

interface TradingCanvasProps {
  activeProfile: WalletProfile | null;
  onOpenWalletModal: () => void;
  currentPrice: number;
  onPriceUpdate: (newPrice: number) => void;
  selectedStake: number;
  selectedLeverage: number;
}

export const TradingCanvas: React.FC<TradingCanvasProps> = ({
  activeProfile,
  onOpenWalletModal,
  currentPrice,
  onPriceUpdate,
  selectedStake,
  selectedLeverage,
}) => {
  const { theme } = useTheme();
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [candles, setCandles] = useState<Candle[]>(priceFeedService.getCandles());
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([]);
  const [flags, setFlags] = useState<TapFlag[]>([]);
  const [mousePos, setMousePos] = useState<{ x: number; y: number; price: number } | null>(null);
  const [activeFlagModal, setActiveFlagModal] = useState<TapFlag | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Min and Max prices visible on chart
  const [priceRange, setPriceRange] = useState({ min: 140.0, max: 146.0 });

  // Dynamically size canvas bitmap to fit parent container pixel-for-pixel (Retina ready)
  useEffect(() => {
    const container = canvasContainerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      if (w > 0 && h > 0) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
    };

    handleResize();
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Subscribe to real-time live Solana market feed
  useEffect(() => {
    const unsubPrice = priceFeedService.subscribePrice((price) => {
      onPriceUpdate(price);
      multiplayerService.checkPriceWicks(price);

      setPriceRange((rng) => {
        const padding = 1.6;
        return {
          min: Math.min(rng.min, price - padding),
          max: Math.max(rng.max, price + padding),
        };
      });
    });

    const unsubCandles = priceFeedService.subscribeCandles((newCandles) => {
      setCandles(newCandles);
      if (newCandles.length > 0) {
        const prices = newCandles.flatMap((c) => [c.high, c.low]);
        const minP = Math.min(...prices);
        const maxP = Math.max(...prices);
        const pad = Math.max(0.8, (maxP - minP) * 0.15);
        setPriceRange({ min: minP - pad, max: maxP + pad });
      }
    });

    return () => {
      unsubPrice();
      unsubCandles();
    };
  }, [onPriceUpdate]);

  // Subscribe to real-time multiplayer cursors & flags
  useEffect(() => {
    const unsubCursors = multiplayerService.subscribeCursors(setRemoteCursors);
    const unsubFlags = multiplayerService.subscribeFlags((updatedFlags) => {
      setFlags(updatedFlags);
      // Check if user's own flag just triggered WIN
      const userWin = updatedFlags.find(
        (f) => f.playerId === activeProfile?.address && f.status === 'WIN' && Date.now() - f.timestamp < 3000
      );
      if (userWin) {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 },
          colors: ['#00FF66', '#FFE600', '#00F0FF'],
        });
      }
    });
    return () => {
      unsubCursors();
      unsubFlags();
    };
  }, [activeProfile]);

  // Track mouse coordinates on Canvas and broadcast real cursor position to peers
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const normX = Math.max(0, Math.min(1, x / rect.width));
      const normY = Math.max(0, Math.min(1, y / rect.height));

      // Price calculation from normalized Y coordinate
      const priceAtY = priceRange.max - normY * (priceRange.max - priceRange.min);

      setMousePos({ x, y, price: priceAtY });

      // Broadcast real cursor position if wallet is connected
      if (activeProfile && activeProfile.isConnected) {
        multiplayerService.broadcastCursor({
          playerId: activeProfile.address,
          name: activeProfile.shortAddress,
          avatar: activeProfile.avatar,
          color: activeProfile.color,
          x: normX,
          y: normY,
          lastUpdated: Date.now(),
        });
      }
    },
    [activeProfile, priceRange]
  );

  const handleMouseLeave = () => {
    setMousePos(null);
  };

  // Click on Canvas -> Tap-to-Trade Flag Drop
  const handleCanvasClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !mousePos) return;

    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;

    // Check if clicked near an existing flag
    const clickedFlag = flags.find((f) => {
      const flagNormY = (priceRange.max - f.price) / (priceRange.max - priceRange.min);
      const flagY = flagNormY * rect.height;
      return Math.abs(y - flagY) < 18;
    });

    if (clickedFlag) {
      setActiveFlagModal(clickedFlag);
      return;
    }

    // Require wallet connection before placing tap trade
    if (!activeProfile || !activeProfile.isConnected) {
      onOpenWalletModal();
      setToastMessage('Connect a Solana Devnet wallet to drop tap flags!');
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }

    if (activeProfile.balanceSol < selectedStake) {
      setToastMessage(`Insufficient balance (${activeProfile.balanceSol} SOL). You need ${selectedStake} SOL to trade!`);
      setTimeout(() => setToastMessage(null), 4000);
      return;
    }

    // Otherwise, plant new flag at clicked price
    const targetPrice = mousePos.price;
    const isLong = targetPrice <= currentPrice;
    const flagType = isLong ? 'LONG' : 'SHORT';
    const roomId = multiplayerService.getRoom();

    setToastMessage('Approving transaction in wallet...');

    try {
      // Submit real on-chain transaction to Solana Devnet & MagicBlock Ephemeral Rollup
      const erEvent = await magicBlockService.submitEphemeralTap({
        playerPubkey: activeProfile.address,
        roomId,
        type: flagType,
        targetPrice,
        stakeSol: selectedStake,
        leverage: selectedLeverage,
        onStatus: (status) => setToastMessage(status),
      });

      const newFlag: TapFlag = {
        id: erEvent.id,
        roomId,
        playerId: activeProfile.address,
        playerName: activeProfile.shortAddress,
        playerAvatar: activeProfile.avatar,
        playerColor: activeProfile.color,
        type: flagType,
        price: targetPrice,
        stakeSol: selectedStake,
        leverage: selectedLeverage,
        timestamp: Date.now(),
        copiedCount: 0,
        status: 'PENDING',
        txSignature: erEvent.signature,
      };

      multiplayerService.broadcastFlag(newFlag);

      // Visual toast feedback with confirmation
      setToastMessage(`Confirmed on Devnet! ${selectedLeverage}x ${flagType} Flag @ $${targetPrice.toFixed(2)}`);
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err: any) {
      console.error('Canvas tap error:', err);
      setToastMessage(err?.message || 'Transaction was cancelled or rejected');
      setTimeout(() => setToastMessage(null), 5000);
    }
  };

  // 1-Click Copy Trade
  const handleCopyTrade = async (flag: TapFlag, isFade: boolean = false) => {
    if (!activeProfile || !activeProfile.isConnected) {
      onOpenWalletModal();
      return;
    }

    if (activeProfile.balanceSol < flag.stakeSol) {
      setToastMessage(`Insufficient balance (${activeProfile.balanceSol} SOL). You need ${flag.stakeSol} SOL to copy!`);
      setTimeout(() => setToastMessage(null), 4000);
      return;
    }

    setActiveFlagModal(null);
    const copiedType = isFade ? (flag.type === 'LONG' ? 'SHORT' : 'LONG') : flag.type;
    setToastMessage(`Approving ${isFade ? 'Fade' : 'Copy'} trade in wallet...`);

    try {
      const erEvent = await magicBlockService.submitEphemeralTap({
        playerPubkey: activeProfile.address,
        roomId: flag.roomId || multiplayerService.getRoom(),
        type: copiedType,
        targetPrice: flag.price,
        stakeSol: flag.stakeSol,
        leverage: flag.leverage,
        onStatus: (status) => setToastMessage(status),
      });

      multiplayerService.copyTrade(
        activeProfile.address,
        activeProfile.shortAddress,
        activeProfile.avatar,
        activeProfile.color,
        flag.id,
        isFade,
        erEvent.signature
      );

      setToastMessage(`Confirmed on Devnet! ${isFade ? 'Faded' : 'Copied'} ${flag.playerName}'s wick!`);
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err: any) {
      console.error('Copy trade error:', err);
      setToastMessage(err?.message || 'Transaction was cancelled or rejected');
      setTimeout(() => setToastMessage(null), 5000);
    }
  };

  // Quick Emoji Taunt Sender
  const sendEmojiTaunt = (emoji: string) => {
    if (!activeProfile || !activeProfile.isConnected) {
      onOpenWalletModal();
      return;
    }
    multiplayerService.sendTaunt(activeProfile.address, emoji);
  };

  // Canvas Rendering Engine (60 FPS Candlesticks, Grid, Traps, and Peer Cursors)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      ctx.save();
      ctx.scale(dpr, dpr);

      // Background
      const isDark = theme === 'dark';
      ctx.fillStyle = isDark ? '#0C110C' : '#FFFFFF';
      ctx.fillRect(0, 0, w, h);

      // Subtle Price Grid Lines
      const pRange = Math.max(0.01, priceRange.max - priceRange.min);
      const gridStep = pRange > 5 ? 1.0 : pRange > 2 ? 0.5 : 0.2;
      const firstGridP = Math.ceil(priceRange.min / gridStep) * gridStep;

      ctx.lineWidth = 1;
      ctx.strokeStyle = isDark ? 'rgba(0, 255, 102, 0.08)' : 'rgba(0, 0, 0, 0.06)';
      ctx.font = '10px monospace';
      ctx.fillStyle = isDark ? 'rgba(0, 255, 102, 0.35)' : 'rgba(0, 0, 0, 0.4)';

      for (let p = firstGridP; p <= priceRange.max; p += gridStep) {
        const y = ((priceRange.max - p) / pRange) * h;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w - 65, y);
        ctx.stroke();

        // Right-hand price label
        ctx.fillText(`$${p.toFixed(2)}`, w - 60, y + 3);
      }

      // Render Candlesticks
      if (candles.length > 0) {
        const candleWidth = Math.max(5, Math.min(18, (w - 80) / candles.length - 3));
        const spacing = (w - 80) / candles.length;

        candles.forEach((c, idx) => {
          const x = 15 + idx * spacing + spacing / 2;
          const openY = ((priceRange.max - c.open) / pRange) * h;
          const closeY = ((priceRange.max - c.close) / pRange) * h;
          const highY = ((priceRange.max - c.high) / pRange) * h;
          const lowY = ((priceRange.max - c.low) / pRange) * h;

          const isBullish = c.close >= c.open;
          const candleColor = isBullish ? (isDark ? '#00FF66' : '#00C853') : '#FF3366';

          // Wick
          ctx.strokeStyle = candleColor;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x, highY);
          ctx.lineTo(x, lowY);
          ctx.stroke();

          // Body
          const bodyY = Math.min(openY, closeY);
          const bodyH = Math.max(2, Math.abs(closeY - openY));

          ctx.fillStyle = candleColor;
          ctx.fillRect(x - candleWidth / 2, bodyY, candleWidth, bodyH);

          // High-contrast border around candle bodies
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1;
          ctx.strokeRect(x - candleWidth / 2, bodyY, candleWidth, bodyH);
        });
      }

      // Real-Time Current Price Line
      const currentY = ((priceRange.max - currentPrice) / pRange) * h;
      ctx.strokeStyle = isDark ? '#00FF66' : '#00C853';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, currentY);
      ctx.lineTo(w, currentY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Current Price Neo-Badge on right edge
      const badgeText = `$${currentPrice.toFixed(2)}`;
      ctx.fillStyle = isDark ? '#00FF66' : '#00C853';
      ctx.fillRect(w - 70, currentY - 10, 68, 20);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(w - 70, currentY - 10, 68, 20);

      ctx.fillStyle = '#000000';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(badgeText, w - 65, currentY + 4);

      // Render Active Tap Flags
      flags.forEach((f) => {
        const flagY = ((priceRange.max - f.price) / pRange) * h;
        if (flagY < -30 || flagY > h + 30) return;

        const isLong = f.type === 'LONG';
        const flagColor = isLong ? '#00FF66' : '#FF3366';
        const isResolved = f.status !== 'PENDING';

        ctx.save();
        ctx.strokeStyle = isResolved ? (f.status === 'WIN' ? '#00FF66' : '#FF3366') : flagColor;
        ctx.lineWidth = isResolved ? 1 : 2;
        ctx.setLineDash(isResolved ? [2, 4] : [6, 3]);

        ctx.beginPath();
        ctx.moveTo(0, flagY);
        ctx.lineTo(w - 80, flagY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Flag Anchor Pin Card
        const pinX = 60 + (parseInt(f.id.replace(/\D/g, ''), 10) || 50) % Math.max(100, Math.floor(w - 240));
        ctx.fillStyle = isResolved ? (f.status === 'WIN' ? '#00FF66' : '#FF3366') : flagColor;
        ctx.fillRect(pinX, flagY - 12, 130, 24);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.strokeRect(pinX, flagY - 12, 130, 24);

        // Flag content text
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 10px monospace';
        const statusLabel = isResolved ? (f.status === 'WIN' ? 'WIN' : 'OUT') : `${f.leverage}x ${f.type}`;
        ctx.fillText(`${f.playerAvatar} ${statusLabel} $${f.price.toFixed(2)}`, pinX + 5, flagY + 4);

        ctx.restore();
      });

      // Render Mouse Crosshair if hovering
      if (mousePos) {
        ctx.save();
        ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.25)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);

        // Horizontal line
        ctx.beginPath();
        ctx.moveTo(0, mousePos.y);
        ctx.lineTo(w, mousePos.y);
        ctx.stroke();

        // Vertical line
        ctx.beginPath();
        ctx.moveTo(mousePos.x, 0);
        ctx.lineTo(mousePos.x, h);
        ctx.stroke();
        ctx.setLineDash([]);

        // Hover Price Tooltip
        const priceLabel = `$${mousePos.price.toFixed(2)}`;
        ctx.fillStyle = isDark ? '#FFE600' : '#000000';
        ctx.fillRect(w - 70, mousePos.y - 10, 68, 20);
        ctx.fillStyle = isDark ? '#000000' : '#FFFFFF';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(priceLabel, w - 65, mousePos.y + 4);

        ctx.restore();
      }

      // Render Real Multiplayer Remote Cursors
      const myId = activeProfile?.address;
      remoteCursors.forEach((c) => {
        if (c.playerId === myId) return; // Don't draw own cursor duplicate

        const cx = c.x * w;
        const cy = c.y * h;

        ctx.save();

        // Cursor arrow pointer
        ctx.fillStyle = c.color;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + 14, cy + 14);
        ctx.lineTo(cx + 6, cy + 14);
        ctx.lineTo(cx + 2, cy + 20);
        ctx.lineTo(cx - 2, cy + 18);
        ctx.lineTo(cx + 3, cy + 12);
        ctx.lineTo(cx - 3, cy + 9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Player Tag Pill with shortened pubkey
        const tagText = `${c.avatar} ${c.name}`;
        ctx.font = 'bold 10px monospace';
        const tagWidth = ctx.measureText(tagText).width + 10;

        ctx.fillStyle = '#000000';
        ctx.fillRect(cx + 12, cy + 18, tagWidth, 18);
        ctx.strokeStyle = c.color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cx + 12, cy + 18, tagWidth, 18);

        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(tagText, cx + 17, cy + 30);

        // Floating Taunt Emoji if active
        if (c.tauntEmoji && c.tauntTimer && Date.now() - c.tauntTimer < 2500) {
          ctx.font = '22px sans-serif';
          ctx.fillText(c.tauntEmoji, cx + 5, cy - 8);
        }

        ctx.restore();
      });

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [candles, currentPrice, priceRange, flags, remoteCursors, mousePos, theme, activeProfile]);

  return (
    <div
      ref={canvasContainerRef}
      className="relative w-full h-[520px] sm:h-[620px] bg-theme-surface border-[3px] border-black shadow-[6px_6px_0px_#000000] overflow-hidden select-none"
    >
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleCanvasClick}
        className="w-full h-full cursor-crosshair block"
      />

      {/* Floating Instructions / Tap Helper */}
      <div className="absolute top-3 left-3 pointer-events-none flex items-center gap-2 flex-wrap">
        <div className="bg-theme-surface/95 backdrop-blur-xs border-2 border-black px-2.5 py-1 text-[11px] font-mono font-bold text-theme-main shadow-[2px_2px_0px_#000000]">
          🎯 CLICK TO DROP TRAP FLAG
        </div>
        <div className="bg-theme-surface/95 backdrop-blur-xs border-2 border-black px-2.5 py-1 text-[11px] font-mono font-bold text-[#00C853] dark:text-[#00FF66] shadow-[2px_2px_0px_#000000] flex items-center gap-1">
          <span className="pulse-green" />
          <span>{remoteCursors.length + (activeProfile?.isConnected ? 1 : 0)} TRADERS ONLINE</span>
        </div>
      </div>

      {/* Quick Emoji Reaction Taunts Strip */}
      <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-theme-surface/90 backdrop-blur-xs border-2 border-black p-1.5 shadow-[3px_3px_0px_#000000]">
        <span className="text-[10px] font-mono font-black px-1 text-theme-muted hidden sm:inline">TAUNT:</span>
        {['🚀', '🔥', '💀', '💎', '🎯', '⚡'].map((emoji) => (
          <button
            key={emoji}
            onClick={() => sendEmojiTaunt(emoji)}
            className="w-7 h-7 flex items-center justify-center text-sm hover:scale-125 transition-transform active:scale-95 bg-theme-inner border border-black"
            title={`Send ${emoji} taunt`}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Wallet Connection Prompt Overlay if not connected */}
      {(!activeProfile || !activeProfile.isConnected) && (
        <div className="absolute bottom-3 right-3 bg-theme-surface/95 border-2 border-black p-2.5 shadow-[4px_4px_0px_#000000] flex items-center gap-3 animate-in fade-in">
          <div className="text-xs font-mono font-bold text-theme-main">
            Connect Devnet wallet to trade
          </div>
          <button
            onClick={onOpenWalletModal}
            className="neo-btn neo-btn-sm neo-btn-green flex items-center gap-1.5 py-1 px-2.5 text-xs font-black"
          >
            <Wallet size={13} />
            <span>CONNECT</span>
          </button>
        </div>
      )}

      {/* Toast Notification Notification */}
      {toastMessage && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-[#00C853] dark:bg-[#00FF66] text-black border-2 border-black px-4 py-2 font-mono font-black text-xs shadow-[4px_4px_0px_#000000] animate-in fade-in zoom-in-95 duration-100 z-20 flex items-center gap-2">
          <span>⚡</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1-Click Copy / Fade Flag Modal */}
      {activeFlagModal && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-4 z-30 animate-in fade-in duration-100">
          <div className="neo-card p-5 w-full max-w-sm shadow-[8px_8px_0px_#000000] font-mono">
            <div className="flex items-center justify-between border-b-2 border-black pb-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">{activeFlagModal.playerAvatar}</span>
                <div>
                  <div className="font-black text-sm text-theme-main font-sans">
                    {activeFlagModal.playerName}
                  </div>
                  <div className="text-[10px] text-theme-muted font-bold">
                    {activeFlagModal.leverage}x {activeFlagModal.type} TRAP FLAG
                  </div>
                </div>
              </div>
              <button
                onClick={() => setActiveFlagModal(null)}
                className="p-1 hover:bg-theme-inner border border-black text-theme-main"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-3 bg-theme-inner border-2 border-black mb-4 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-theme-muted font-bold">TARGET PRICE:</span>
                <span className="font-black text-theme-main">${activeFlagModal.price.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-theme-muted font-bold">STAKE:</span>
                <span className="font-black text-theme-main">{activeFlagModal.stakeSol} SOL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-theme-muted font-bold">COPIED BY:</span>
                <span className="font-black text-[#00C853] dark:text-[#00FF66]">
                  {activeFlagModal.copiedCount || 0} degens
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => handleCopyTrade(activeFlagModal, false)}
                className="neo-btn neo-btn-green py-2 text-xs font-black flex items-center justify-center gap-1.5"
              >
                <Copy size={14} />
                <span>1-CLICK COPY</span>
              </button>
              <button
                onClick={() => handleCopyTrade(activeFlagModal, true)}
                className="neo-btn neo-btn-yellow py-2 text-xs font-black flex items-center justify-center gap-1.5"
              >
                <span>⚔️ FADE MOVE</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
