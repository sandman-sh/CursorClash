import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { multiplayerService, type RemoteCursor, type TapFlag } from '../lib/multiplayer';
import { magicBlockService } from '../lib/magicblock';
import { priceFeedService, type Candle, type MarketStats } from '../lib/priceFeed';
import type { WalletProfile } from '../lib/solana';
import { useTheme } from '../lib/theme';
import confetti from 'canvas-confetti';
import { Copy, X, Zap, Activity, BarChart2, TrendingUp, TrendingDown, Target, Grid } from 'lucide-react';

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
  const [marketStats, setMarketStats] = useState<MarketStats>(priceFeedService.getMarketStats());
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([]);
  const [flags, setFlags] = useState<TapFlag[]>([]);
  const [mousePos, setMousePos] = useState<{ x: number; y: number; price: number; time?: number } | null>(null);
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
  const [activeFlagModal, setActiveFlagModal] = useState<TapFlag | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Technical chart toggles
  const [showEMA, setShowEMA] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [timeframe, setTimeframe] = useState<'1s' | '5s' | '15s' | '1m'>('5s');

  // Dynamic Price Range (Min & Max) computed dynamically from visible candles
  const priceRange = useMemo(() => {
    if (!candles || candles.length === 0) {
      const p = currentPrice || 142.5;
      return { min: p - 1.2, max: p + 1.2 };
    }

    // Use last 45 candles for clean spacing
    const slice = candles.slice(-45);
    const lows = slice.map((c) => c.low);
    const highs = slice.map((c) => c.high);
    if (currentPrice > 0) {
      lows.push(currentPrice);
      highs.push(currentPrice);
    }

    // Include active flags within reasonable distance
    flags.forEach((f) => {
      if (Math.abs(f.price - currentPrice) < currentPrice * 0.05) {
        lows.push(f.price);
        highs.push(f.price);
      }
    });

    const minLow = Math.min(...lows);
    const maxHigh = Math.max(...highs);
    const rawSpread = Math.max(minLow * 0.0035, maxHigh - minLow);

    // 15% padding at top, 28% at bottom to allow volume histogram clearance
    const padTop = rawSpread * 0.15;
    const padBottom = rawSpread * 0.28;

    return {
      min: minLow - padBottom,
      max: maxHigh + padTop,
    };
  }, [candles, currentPrice, flags]);

  // Dynamically size canvas bitmap to fit parent container pixel-for-pixel (Retina ready)
  useEffect(() => {
    const container = canvasContainerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.floor(rect.width);
      // Allocate height minus the top institutional header bar (52px)
      const h = Math.max(400, Math.floor(rect.height - 52));
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
    const unsubPrice = priceFeedService.subscribePrice((price, stats) => {
      onPriceUpdate(price);
      setMarketStats(stats);
      multiplayerService.checkPriceWicks(price);
    });

    const unsubCandles = priceFeedService.subscribeCandles((newCandles) => {
      setCandles(newCandles);
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
      const userWin = updatedFlags.find(
        (f) => f.playerId === activeProfile?.address && f.status === 'WIN' && Date.now() - f.timestamp < 3000
      );
      if (userWin) {
        confetti({
          particleCount: 60,
          spread: 70,
          origin: { y: 0.65 },
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

      const gutterRight = 75;
      const gutterBottom = 26;
      const chartW = rect.width - gutterRight;
      const chartH = rect.height - gutterBottom;

      const normX = Math.max(0, Math.min(1, x / chartW));
      const normY = Math.max(0, Math.min(1, y / chartH));

      // Price calculation from normalized Y coordinate
      const pRange = priceRange.max - priceRange.min;
      const priceAtY = priceRange.max - normY * pRange;

      // Detect hovered candle
      const visibleCandles = candles.slice(-45);
      if (visibleCandles.length > 0 && x <= chartW) {
        const spacing = chartW / visibleCandles.length;
        const candleIdx = Math.floor(x / spacing);
        if (candleIdx >= 0 && candleIdx < visibleCandles.length) {
          const hovered = visibleCandles[candleIdx];
          setHoveredCandle(hovered);
          setMousePos({ x, y, price: priceAtY, time: hovered.timestamp });
        } else {
          setMousePos({ x, y, price: priceAtY });
        }
      } else {
        setMousePos({ x, y, price: priceAtY });
      }

      // Broadcast cursor position (throttled inside multiplayer service)
      const myTabId = multiplayerService.getTabId();
      const guestName = 'GUEST_' + myTabId.slice(-4).toUpperCase();
      multiplayerService.broadcastCursor({
        playerId: activeProfile?.address || myTabId,
        name: activeProfile?.shortAddress || guestName,
        avatar: activeProfile?.avatar || '⚡',
        color: activeProfile?.color || '#00FF66',
        x: normX,
        y: normY,
        lastUpdated: Date.now(),
      });
    },
    [activeProfile, priceRange, candles]
  );

  const handleMouseLeave = () => {
    setMousePos(null);
    setHoveredCandle(null);
  };

  // Click on Canvas -> Tap-to-Trade Flag Drop
  const handleCanvasClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !mousePos) return;

    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const gutterBottom = 26;
    const chartH = rect.height - gutterBottom;

    // Check if clicked near an existing flag
    const clickedFlag = flags.find((f) => {
      const flagNormY = (priceRange.max - f.price) / (priceRange.max - priceRange.min);
      const flagY = flagNormY * chartH;
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
      setTimeout(() => setToastMessage(null), 3500);
      return;
    }

    if (activeProfile.balanceSol < selectedStake) {
      setToastMessage(`Insufficient balance (${activeProfile.balanceSol.toFixed(2)} SOL). You need ${selectedStake} SOL!`);
      setTimeout(() => setToastMessage(null), 4000);
      return;
    }

    // Plant new flag at clicked price
    const targetPrice = mousePos.price;
    const isLong = targetPrice <= currentPrice;
    const flagType = isLong ? 'LONG' : 'SHORT';
    const roomId = multiplayerService.getRoom();

    setToastMessage('Approving transaction in wallet...');

    try {
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
      setToastMessage(`Insufficient balance (${activeProfile.balanceSol.toFixed(2)} SOL). You need ${flag.stakeSol} SOL!`);
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

  // Canvas Rendering Engine (60 FPS Candlesticks, Dual-Axis Grid, Volume, EMA, and Cursors)
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

      const isDark = theme === 'dark';
      const gutterRight = 75;
      const gutterBottom = 26;
      const chartW = w - gutterRight;
      const chartH = h - gutterBottom;

      // 1. Clear & Background
      ctx.fillStyle = isDark ? '#0A0E13' : '#FFFFFF';
      ctx.fillRect(0, 0, w, h);

      // Price Gutter Background
      ctx.fillStyle = isDark ? '#0E131A' : '#F6F8F3';
      ctx.fillRect(chartW, 0, gutterRight, h);

      // Time Gutter Background
      ctx.fillStyle = isDark ? '#0E131A' : '#F6F8F3';
      ctx.fillRect(0, chartH, w, gutterBottom);

      // Separator Borders
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.15)';
      ctx.lineWidth = 1;
      // Vertical price divider
      ctx.beginPath();
      ctx.moveTo(chartW, 0);
      ctx.lineTo(chartW, h);
      ctx.stroke();
      // Horizontal time divider
      ctx.beginPath();
      ctx.moveTo(0, chartH);
      ctx.lineTo(w, chartH);
      ctx.stroke();

      const pRange = Math.max(0.001, priceRange.max - priceRange.min);

      // 2. Horizontal Price Grid & Labels
      if (showGrid) {
        // Compute human-friendly price step
        let step = 0.5;
        if (pRange < 0.6) step = 0.05;
        else if (pRange < 1.2) step = 0.1;
        else if (pRange < 2.5) step = 0.2;
        else if (pRange < 6) step = 0.5;
        else if (pRange < 15) step = 1.0;
        else step = 2.0;

        const firstGridP = Math.ceil(priceRange.min / step) * step;
        ctx.font = '10px "JetBrains Mono", monospace';

        for (let p = firstGridP; p <= priceRange.max; p += step) {
          const y = Math.floor(((priceRange.max - p) / pRange) * chartH) + 0.5;
          if (y < 5 || y > chartH - 5) continue;

          // Grid line
          ctx.save();
          ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(chartW, y);
          ctx.stroke();
          ctx.restore();

          // Price label in right gutter
          ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.55)';
          ctx.fillText(`$${p.toFixed(2)}`, chartW + 8, y + 3.5);
        }
      }

      // 3. Render Candlesticks & Volume
      const visibleCandles = candles.slice(-45);
      const candleCount = visibleCandles.length;

      if (candleCount > 0) {
        const spacing = chartW / candleCount;
        const candleWidth = Math.max(5, Math.min(18, spacing * 0.68));

        // Volume calculation
        const maxVol = Math.max(1, ...visibleCandles.map((c) => c.volume || 100));
        const volAreaH = chartH * 0.18; // bottom 18% for volume

        // EMA-20 storage
        const emaPoints: { x: number; y: number }[] = [];
        const k = 2 / (20 + 1);
        let currentEma: number | null = null;

        visibleCandles.forEach((c, idx) => {
          const cx = Math.floor(idx * spacing + spacing / 2) + 0.5;
          const openY = ((priceRange.max - c.open) / pRange) * chartH;
          const closeY = ((priceRange.max - c.close) / pRange) * chartH;
          const highY = ((priceRange.max - c.high) / pRange) * chartH;
          const lowY = ((priceRange.max - c.low) / pRange) * chartH;

          const isBullish = c.close >= c.open;
          const candleColor = isBullish ? (isDark ? '#00FF66' : '#00C853') : '#FF3366';

          // Volume Histogram Bar
          if (showVolume) {
            const vol = c.volume || 100;
            const barH = Math.max(2, (vol / maxVol) * volAreaH);
            const barY = chartH - barH;
            ctx.fillStyle = isBullish
              ? isDark ? 'rgba(0, 255, 102, 0.28)' : 'rgba(0, 200, 83, 0.28)'
              : 'rgba(255, 51, 102, 0.28)';
            ctx.fillRect(cx - candleWidth / 2, barY, candleWidth, barH);
          }

          // Candlestick Wick
          ctx.strokeStyle = candleColor;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(cx, highY);
          ctx.lineTo(cx, lowY);
          ctx.stroke();

          // Candlestick Body
          const bodyY = Math.min(openY, closeY);
          const bodyH = Math.max(2, Math.abs(closeY - openY));

          ctx.fillStyle = candleColor;
          ctx.fillRect(cx - candleWidth / 2, bodyY, candleWidth, bodyH);

          // Crisp border around candle body
          ctx.strokeStyle = isDark ? '#000000' : 'rgba(0,0,0,0.4)';
          ctx.lineWidth = 1;
          ctx.strokeRect(cx - candleWidth / 2, bodyY, candleWidth, bodyH);

          // Vertical Time Grid & Bottom Time Labels
          if (showGrid && idx % 7 === 0) {
            ctx.save();
            ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 3]);
            ctx.beginPath();
            ctx.moveTo(cx, 0);
            ctx.lineTo(cx, chartH);
            ctx.stroke();
            ctx.restore();

            const date = new Date(c.timestamp);
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.5)';
            ctx.font = '9px "JetBrains Mono", monospace';
            ctx.fillText(timeStr, cx - 20, chartH + 16);
          }

          // Accumulate EMA-20
          if (idx < 5) {
            currentEma = c.close;
          } else {
            currentEma = c.close * k + (currentEma ?? c.close) * (1 - k);
            const emaY = ((priceRange.max - currentEma) / pRange) * chartH;
            emaPoints.push({ x: cx, y: emaY });
          }
        });

        // Render EMA-20 Trend Curve
        if (showEMA && emaPoints.length > 1) {
          ctx.save();
          ctx.strokeStyle = isDark ? '#FFE600' : '#D97706';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(emaPoints[0].x, emaPoints[0].y);
          for (let i = 1; i < emaPoints.length; i++) {
            ctx.lineTo(emaPoints[i].x, emaPoints[i].y);
          }
          ctx.stroke();
          ctx.restore();
        }
      }

      // 4. Real-Time Current Price Line & Beacon
      if (currentPrice > 0) {
        const currentY = Math.floor(((priceRange.max - currentPrice) / pRange) * chartH) + 0.5;
        const lastC = visibleCandles[visibleCandles.length - 1];
        const isBullish = lastC ? currentPrice >= lastC.open : true;
        const priceLineColor = isBullish ? (isDark ? '#00FF66' : '#00C853') : '#FF3366';

        // Horizontal Price Line
        ctx.save();
        ctx.strokeStyle = priceLineColor;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, currentY);
        ctx.lineTo(chartW, currentY);
        ctx.stroke();
        ctx.restore();

        // Pulsing radar dot on latest candle
        if (candleCount > 0) {
          const spacing = chartW / candleCount;
          const latestX = Math.floor((candleCount - 1) * spacing + spacing / 2) + 0.5;

          ctx.fillStyle = priceLineColor;
          ctx.beginPath();
          ctx.arc(latestX, currentY, 3.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = priceLineColor;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(latestX, currentY, 7, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Current Price Solid Badge in Right Gutter
        const badgeText = `$${currentPrice.toFixed(2)}`;
        ctx.fillStyle = priceLineColor;
        ctx.fillRect(chartW + 2, currentY - 10, gutterRight - 4, 20);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(chartW + 2, currentY - 10, gutterRight - 4, 20);

        ctx.fillStyle = '#000000';
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.fillText(badgeText, chartW + 6, currentY + 4);
      }

      // 5. Render Active Tap Flags
      flags.forEach((f) => {
        const flagY = ((priceRange.max - f.price) / pRange) * chartH;
        if (flagY < -30 || flagY > chartH + 30) return;

        const isLong = f.type === 'LONG';
        const flagColor = isLong ? '#00FF66' : '#FF3366';
        const isResolved = f.status !== 'PENDING';

        ctx.save();
        ctx.strokeStyle = isResolved ? (f.status === 'WIN' ? '#00FF66' : '#FF3366') : flagColor;
        ctx.lineWidth = isResolved ? 1 : 2;
        ctx.setLineDash(isResolved ? [2, 4] : [6, 3]);

        ctx.beginPath();
        ctx.moveTo(0, flagY);
        ctx.lineTo(chartW, flagY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Flag Anchor Pin Card
        const pinX = 60 + (parseInt(f.id.replace(/\D/g, ''), 10) || 50) % Math.max(100, Math.floor(chartW - 200));
        ctx.fillStyle = isResolved ? (f.status === 'WIN' ? '#00FF66' : '#FF3366') : flagColor;
        ctx.fillRect(pinX, flagY - 12, 130, 24);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.strokeRect(pinX, flagY - 12, 130, 24);

        ctx.fillStyle = '#000000';
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        const statusLabel = isResolved ? (f.status === 'WIN' ? 'WIN' : 'OUT') : `${f.leverage}x ${f.type}`;
        ctx.fillText(`${f.playerAvatar} ${statusLabel} $${f.price.toFixed(2)}`, pinX + 5, flagY + 4);

        ctx.restore();
      });

      // 6. Interactive Crosshair & Tooltips
      if (mousePos && mousePos.x <= chartW && mousePos.y <= chartH) {
        ctx.save();
        ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);

        // Horizontal crosshair line
        ctx.beginPath();
        ctx.moveTo(0, mousePos.y);
        ctx.lineTo(chartW, mousePos.y);
        ctx.stroke();

        // Vertical crosshair line
        ctx.beginPath();
        ctx.moveTo(mousePos.x, 0);
        ctx.lineTo(mousePos.x, chartH);
        ctx.stroke();
        ctx.setLineDash([]);

        // Hover Price Badge in Right Gutter
        const priceLabel = `$${mousePos.price.toFixed(2)}`;
        ctx.fillStyle = isDark ? '#FFE600' : '#000000';
        ctx.fillRect(chartW + 2, mousePos.y - 10, gutterRight - 4, 20);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.strokeRect(chartW + 2, mousePos.y - 10, gutterRight - 4, 20);

        ctx.fillStyle = isDark ? '#000000' : '#FFFFFF';
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.fillText(priceLabel, chartW + 6, mousePos.y + 4);

        // Hover Time Badge in Bottom Gutter
        if (mousePos.time) {
          const date = new Date(mousePos.time);
          const timeLabel = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          ctx.fillStyle = isDark ? '#FFE600' : '#000000';
          ctx.fillRect(mousePos.x - 30, chartH + 2, 60, 20);
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1;
          ctx.strokeRect(mousePos.x - 30, chartH + 2, 60, 20);

          ctx.fillStyle = isDark ? '#000000' : '#FFFFFF';
          ctx.font = 'bold 9px "JetBrains Mono", monospace';
          ctx.fillText(timeLabel, mousePos.x - 24, chartH + 15);
        }

        ctx.restore();
      }

      // 7. Render ALL Multiplayer Cursors (local + remote + simulated)
      const myTabId = multiplayerService.getTabId();
      remoteCursors.forEach((c) => {
        const isLocalTab = c.sessionId === myTabId;

        // For the local tab's cursor, use mousePos for pixel-perfect positioning
        // For remote/simulated cursors, use normalized coordinates
        let cx: number, cy: number;
        if (isLocalTab && mousePos && mousePos.x <= chartW && mousePos.y <= chartH) {
          cx = mousePos.x;
          cy = mousePos.y;
        } else if (isLocalTab) {
          // Local tab cursor but mouse is outside chart area — skip rendering
          return;
        } else {
          cx = (c.x ?? 0.5) * chartW;
          cy = (c.y ?? 0.5) * chartH;
        }

        if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
        if (cx < -50 || cx > chartW + 50 || cy < -50 || cy > chartH + 50) return;

        const cursorColor = c.color || '#00FF66';
        const cursorAvatar = c.avatar || '⚡';
        const displayName = isLocalTab ? (activeProfile?.shortAddress || 'YOU') : (c.name || 'TRADER');

        ctx.save();

        // Cursor Pointer Arrow
        ctx.fillStyle = cursorColor;
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

        // Gamer Tag Box
        const tagText = `${cursorAvatar} ${displayName}`;
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        const tagWidth = ctx.measureText(tagText).width + 10;

        ctx.fillStyle = '#000000';
        ctx.fillRect(cx + 12, cy + 18, tagWidth, 18);
        ctx.strokeStyle = cursorColor;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cx + 12, cy + 18, tagWidth, 18);

        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(tagText, cx + 17, cy + 30);

        // Floating Taunt Emoji
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
  }, [candles, currentPrice, priceRange, flags, remoteCursors, mousePos, theme, activeProfile, showEMA, showVolume, showGrid]);

  // Active candle to show in HUD (hovered candle or latest candle)
  const hudCandle = hoveredCandle || (candles.length > 0 ? candles[candles.length - 1] : null);

  return (
    <div
      ref={canvasContainerRef}
      className="relative w-full h-[540px] sm:h-[640px] bg-theme-surface border-[3px] border-black shadow-[6px_6px_0px_#000000] flex flex-col overflow-hidden select-none"
    >
      {/* ── Institutional Trading Header Bar ── */}
      <div className="w-full h-[52px] shrink-0 border-b-[3px] border-black bg-theme-inner px-3 sm:px-4 flex items-center justify-between gap-3 flex-wrap">
        
        {/* Left: Asset, Price & 24h Change */}
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold font-sans text-sm sm:text-base text-theme-main tracking-tight">
              SOL / USDT
            </span>
            <span className="neo-badge neo-badge-green text-[9px] py-0 px-1.5 flex items-center gap-1">
              <span className="pulse-green inline-block" />
              <span>LIVE</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono font-black text-base sm:text-lg text-theme-main">
              ${currentPrice > 0 ? currentPrice.toFixed(2) : '---.--'}
            </span>
            <span
              className={`font-mono text-xs font-black px-1.5 py-0.5 border border-black flex items-center gap-0.5 ${
                marketStats.change24h >= 0 ? 'bg-[#00C853] text-black' : 'bg-[#FF3366] text-white'
              }`}
            >
              {marketStats.change24h >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              <span>{marketStats.change24h >= 0 ? '+' : ''}{marketStats.change24h.toFixed(2)}%</span>
            </span>
          </div>
        </div>

        {/* Center: Live Candle OHLCV HUD */}
        {hudCandle && (
          <div className="hidden xl:flex items-center gap-3 font-mono text-[11px] text-theme-muted font-bold">
            <div>
              <span>O: </span>
              <span className="font-black text-theme-main">${hudCandle.open.toFixed(2)}</span>
            </div>
            <div>
              <span>H: </span>
              <span className="font-black text-[#00C853] dark:text-[#00FF66]">${hudCandle.high.toFixed(2)}</span>
            </div>
            <div>
              <span>L: </span>
              <span className="font-black text-[#FF3366]">${hudCandle.low.toFixed(2)}</span>
            </div>
            <div>
              <span>C: </span>
              <span className="font-black text-theme-main">${hudCandle.close.toFixed(2)}</span>
            </div>
            {hudCandle.volume && (
              <div>
                <span>VOL: </span>
                <span className="font-black text-theme-main">{Math.round(hudCandle.volume)}</span>
              </div>
            )}
          </div>
        )}

        {/* Right: Technical Indicator & Timeframe Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Timeframe selector */}
          <div className="flex items-center border-2 border-black bg-theme-surface">
            {(['1s', '5s', '15s', '1m'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-0.5 font-mono text-[10px] font-black transition-colors ${
                  timeframe === tf
                    ? 'bg-black text-[#00FF66]'
                    : 'text-theme-main hover:bg-theme-inner'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* EMA Toggle */}
          <button
            onClick={() => setShowEMA(!showEMA)}
            className={`neo-btn neo-btn-xs py-1 px-2 font-mono text-[10px] font-black flex items-center gap-1 ${
              showEMA ? 'bg-[#FFE600] text-black border-2 border-black' : 'bg-theme-surface text-theme-muted border-2 border-black'
            }`}
            title="Toggle EMA-20 Trendline"
          >
            <Activity size={12} />
            <span>EMA 20</span>
          </button>

          {/* Volume Toggle */}
          <button
            onClick={() => setShowVolume(!showVolume)}
            className={`neo-btn neo-btn-xs py-1 px-2 font-mono text-[10px] font-black flex items-center gap-1 ${
              showVolume ? 'bg-[#00C853] dark:bg-[#00FF66] text-black border-2 border-black' : 'bg-theme-surface text-theme-muted border-2 border-black'
            }`}
            title="Toggle Volume Bars"
          >
            <BarChart2 size={12} />
            <span>VOL</span>
          </button>

          {/* Grid Toggle */}
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`neo-btn neo-btn-xs py-1 px-2 font-mono text-[10px] font-black flex items-center gap-1 ${
              showGrid ? 'bg-[#00F0FF] text-black border-2 border-black' : 'bg-theme-surface text-theme-muted border-2 border-black'
            }`}
            title="Toggle Price & Time Grid"
          >
            <Grid size={12} />
            <span>GRID</span>
          </button>
        </div>

      </div>

      {/* ── Main Canvas Engine ── */}
      <div className="relative flex-1 w-full h-full overflow-hidden">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleCanvasClick}
          className="w-full h-full cursor-crosshair block"
        />

        {/* Floating Tap Helper Badge */}
        <div className="absolute top-3 left-3 pointer-events-none flex items-center gap-2 flex-wrap">
          <div className="bg-theme-surface/95 backdrop-blur-xs border-2 border-black px-2.5 py-1 text-[11px] font-mono font-bold text-theme-main shadow-[2px_2px_0px_#000000] flex items-center gap-1.5">
            <Target size={13} className="text-[#00C853] dark:text-[#00FF66]" />
            <span>CLICK PRICE WICK TO DROP LONG/SHORT FLAG</span>
          </div>
          <div className="bg-theme-surface/95 backdrop-blur-xs border-2 border-black px-2.5 py-1 text-[11px] font-mono font-bold text-[#00C853] dark:text-[#00FF66] shadow-[2px_2px_0px_#000000] flex items-center gap-1">
            <span className="pulse-green" />
            <span>{remoteCursors.length + (activeProfile?.isConnected ? 1 : 0)} TRADERS IN SQUAD</span>
          </div>
        </div>

        {/* Quick Emoji Reaction Taunts Strip */}
        <div className="absolute bottom-10 left-3 flex items-center gap-1.5 bg-theme-surface/95 backdrop-blur-xs border-2 border-black p-1.5 shadow-[3px_3px_0px_#000000] z-10">
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

        {/* Toast Notification Notification */}
        {toastMessage && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-[#00C853] dark:bg-[#00FF66] text-black border-2 border-black px-4 py-2 font-mono font-black text-xs shadow-[4px_4px_0px_#000000] animate-in fade-in zoom-in-95 duration-100 z-20 flex items-center gap-2">
            <Zap size={14} />
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
                      {activeFlagModal.leverage}x {activeFlagModal.type} FLAG
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
                    {activeFlagModal.copiedCount || 0} traders
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
    </div>
  );
};
