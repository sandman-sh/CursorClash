/**
 * Real-Time Multiplayer Cursor & Event Synchronization Service
 * Dual-layer synchronization using native BroadcastChannel (zero-latency cross-tab)
 * and WebSocket Relay (cross-browser/network) with room-based canvas isolation and Supabase logging.
 */

import { supabaseService, type DbTradeLog } from './supabase';
import { solanaWalletService } from './solana';

export interface RemoteCursor {
  playerId: string;
  name: string;
  avatar: string;
  color: string;
  x: number; // 0 to 1 relative canvas position
  y: number; // 0 to 1 relative canvas position
  lastUpdated: number;
  tauntEmoji?: string;
  tauntTimer?: number;
}

export interface TapFlag {
  id: string;
  roomId: string;
  playerId: string;
  playerName: string;
  playerAvatar: string;
  playerColor: string;
  type: 'LONG' | 'SHORT';
  price: number;
  stakeSol: number;
  leverage: number;
  timestamp: number;
  copiedCount: number;
  isResolved?: boolean;
  status: 'PENDING' | 'TRIGGERED' | 'WIN' | 'LOSS';
  pnlSol?: number;
  txSignature?: string;
  resolveTxSignature?: string;
}

export interface TapeEntry {
  id: string;
  roomId: string;
  timestamp: number;
  playerName: string;
  playerAvatar: string;
  action: 'PLANTED_LONG' | 'PLANTED_SHORT' | 'COPIED' | 'FADED' | 'LIQUIDATED' | 'TAKE_PROFIT';
  detail: string;
  pnl?: number;
  color: string;
  txSignature?: string;
}

type EventCallback<T> = (data: T) => void;

interface SyncMessage {
  id: string;
  roomId: string;
  sourceTabId: string;
  type: 'CURSOR_MOVE' | 'NEW_FLAG' | 'RESOLVE_FLAG' | 'TAUNT' | 'COPY_TRADE' | 'PLAYER_LEAVE';
  payload: any;
}

class MultiplayerService {
  private channel: BroadcastChannel | null = null;
  private ws: WebSocket | null = null;
  private tabId: string;
  private currentRoomId: string = 'trench-1';
  private cursors: Map<string, RemoteCursor> = new Map();
  private flags: Map<string, TapFlag> = new Map();
  private tapeEntries: TapeEntry[] = [];
  private processedMsgIds: Set<string> = new Set();

  private cursorListeners: Set<EventCallback<RemoteCursor[]>> = new Set();
  private flagListeners: Set<EventCallback<TapFlag[]>> = new Set();
  private tapeListeners: Set<EventCallback<TapeEntry[]>> = new Set();

  constructor() {
    this.tabId = 'tab_' + Math.random().toString(36).substring(2, 9);

    // Cross-tab BroadcastChannel
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        this.channel = new BroadcastChannel('cursorclash_multiplayer_channel');
        this.channel.onmessage = (e) => this.handleIncomingMessage(e.data);
      }
    } catch (err) {
      console.warn('BroadcastChannel not supported:', err);
    }

    // Cross-browser WebSocket relay
    this.initWebSocket();

    // Stale cursor cleanup (removes inactive peers after 12s)
    if (typeof window !== 'undefined') {
      setInterval(() => this.cleanupStaleCursors(), 3000);
    }
  }

  public setRoom(roomId: string) {
    if (this.currentRoomId === roomId) return;
    this.currentRoomId = roomId;

    // Reset local canvas state for the new room
    this.cursors.clear();
    this.flags.clear();
    this.tapeEntries = [];

    this.notifyCursors();
    this.notifyFlags();
    this.notifyTape();
  }

  public getRoom(): string {
    return this.currentRoomId;
  }

  private initWebSocket() {
    if (typeof window === 'undefined') return;

    try {
      const isSecure = window.location.protocol === 'https:';
      const wsProto = isSecure ? 'wss:' : 'ws:';
      const wsUrl = `${wsProto}//${window.location.host}/multiplayer`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleIncomingMessage(data);
        } catch {
          // ignore
        }
      };

      this.ws.onclose = () => {
        setTimeout(() => this.initWebSocket(), 4000);
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      // fallback to BroadcastChannel
    }
  }

  private broadcast(type: SyncMessage['type'], payload: any) {
    const msg: SyncMessage = {
      id: `${this.tabId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      roomId: this.currentRoomId,
      sourceTabId: this.tabId,
      type,
      payload,
    };

    this.processedMsgIds.add(msg.id);
    if (this.processedMsgIds.size > 200) {
      const first = this.processedMsgIds.values().next().value;
      if (first) this.processedMsgIds.delete(first);
    }

    // Broadcast across tabs
    if (this.channel) {
      try {
        this.channel.postMessage(msg);
      } catch (err) {
        console.warn('BroadcastChannel error:', err);
      }
    }

    // Broadcast across network clients
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
      } catch (err) {
        console.warn('WebSocket send error:', err);
      }
    }
  }

  private handleIncomingMessage(msg: SyncMessage) {
    if (!msg || !msg.type || !msg.id) return;
    if (msg.sourceTabId === this.tabId) return; // ignore self
    if (msg.roomId !== this.currentRoomId) return; // room isolation
    if (this.processedMsgIds.has(msg.id)) return; // duplicate

    this.processedMsgIds.add(msg.id);
    if (this.processedMsgIds.size > 200) {
      const first = this.processedMsgIds.values().next().value;
      if (first) this.processedMsgIds.delete(first);
    }

    switch (msg.type) {
      case 'CURSOR_MOVE': {
        const c: RemoteCursor = msg.payload;
        this.cursors.set(c.playerId, c);
        this.notifyCursors();
        break;
      }
      case 'NEW_FLAG': {
        const flag: TapFlag = msg.payload;
        this.flags.set(flag.id, flag);
        this.notifyFlags();
        this.addTapeEntry({
          id: 'tape-' + Math.random().toString(36).substring(2, 9),
          roomId: flag.roomId,
          timestamp: flag.timestamp,
          playerName: flag.playerName,
          playerAvatar: flag.playerAvatar,
          action: flag.type === 'LONG' ? 'PLANTED_LONG' : 'PLANTED_SHORT',
          detail: `${flag.leverage}x on SOL @ $${flag.price.toFixed(2)} (${flag.stakeSol} SOL)`,
          color: flag.type === 'LONG' ? '#00FF66' : '#FF3366',
        });
        break;
      }
      case 'RESOLVE_FLAG': {
        const { flagId, status, pnlSol, settlementPrice } = msg.payload;
        const flag = this.flags.get(flagId);
        if (flag) {
          flag.status = status;
          flag.pnlSol = pnlSol;
          this.notifyFlags();

          this.addTapeEntry({
            id: 'tape-' + Math.random().toString(36).substring(2, 9),
            roomId: flag.roomId,
            timestamp: Date.now(),
            playerName: flag.playerName,
            playerAvatar: flag.playerAvatar,
            action: status === 'WIN' ? 'TAKE_PROFIT' : 'LIQUIDATED',
            detail:
              status === 'WIN'
                ? `Target hit @ $${settlementPrice.toFixed(2)} (+${pnlSol} SOL)`
                : `Wick stopped flag @ $${settlementPrice.toFixed(2)} (-${flag.stakeSol} SOL)`,
            pnl: pnlSol,
            color: status === 'WIN' ? '#00FF66' : '#FF3366',
          });
        }
        break;
      }
      case 'TAUNT': {
        const { playerId, emoji } = msg.payload;
        const c = this.cursors.get(playerId);
        if (c) {
          c.tauntEmoji = emoji;
          c.tauntTimer = Date.now();
          this.notifyCursors();
          setTimeout(() => {
            if (c.tauntEmoji === emoji) {
              delete c.tauntEmoji;
              this.notifyCursors();
            }
          }, 2500);
        }
        break;
      }
      case 'COPY_TRADE': {
        const { followerName, followerAvatar, targetName, leverage, type, isFade } = msg.payload;
        this.addTapeEntry({
          id: 'tape-' + Math.random().toString(36).substring(2, 9),
          roomId: this.currentRoomId,
          timestamp: Date.now(),
          playerName: followerName,
          playerAvatar: followerAvatar,
          action: isFade ? 'FADED' : 'COPIED',
          detail: `${isFade ? 'Faded' : 'Copied'} ${targetName}'s ${leverage}x ${type}`,
          color: isFade ? '#FFE600' : '#00F0FF',
        });
        break;
      }
      case 'PLAYER_LEAVE': {
        const { playerId } = msg.payload;
        this.cursors.delete(playerId);
        this.notifyCursors();
        break;
      }
    }
  }

  public subscribeCursors(cb: EventCallback<RemoteCursor[]>): () => void {
    this.cursorListeners.add(cb);
    cb(Array.from(this.cursors.values()));
    return () => this.cursorListeners.delete(cb);
  }

  public subscribeFlags(cb: EventCallback<TapFlag[]>): () => void {
    this.flagListeners.add(cb);
    cb(Array.from(this.flags.values()));
    return () => this.flagListeners.delete(cb);
  }

  public subscribeTape(cb: EventCallback<TapeEntry[]>): () => void {
    this.tapeListeners.add(cb);
    cb([...this.tapeEntries]);
    return () => this.tapeListeners.delete(cb);
  }

  public getActiveFlags(): TapFlag[] {
    return Array.from(this.flags.values());
  }

  public getActiveCursors(): RemoteCursor[] {
    return Array.from(this.cursors.values());
  }

  /**
   * Broadcast real player cursor position within current room
   */
  public broadcastCursor(cursor: RemoteCursor) {
    this.broadcast('CURSOR_MOVE', cursor);
  }

  /**
   * Broadcast newly placed tap flag and record to Supabase
   */
  public broadcastFlag(flag: TapFlag) {
    this.flags.set(flag.id, flag);
    this.notifyFlags();

    this.broadcast('NEW_FLAG', flag);

    this.addTapeEntry({
      id: 'tape-' + Math.random().toString(36).substring(2, 9),
      roomId: flag.roomId,
      timestamp: flag.timestamp,
      playerName: flag.playerName,
      playerAvatar: flag.playerAvatar,
      action: flag.type === 'LONG' ? 'PLANTED_LONG' : 'PLANTED_SHORT',
      detail: `${flag.leverage}x on SOL @ $${flag.price.toFixed(2)} (${flag.stakeSol} SOL)`,
      color: flag.type === 'LONG' ? '#00FF66' : '#FF3366',
    });

    // Asynchronously log trade to Supabase database
    const dbTrade: DbTradeLog = {
      id: flag.id,
      room_id: flag.roomId,
      player_address: flag.playerId,
      player_name: flag.playerName,
      type: flag.type,
      target_price: flag.price,
      stake_sol: flag.stakeSol,
      leverage: flag.leverage,
      status: 'PENDING',
      pnl_sol: 0,
    };
    supabaseService.logTrade(dbTrade);
  }

  /**
   * Resolve an active flag when price triggers it and record to Supabase
   */
  public resolveFlag(flagId: string, isWin: boolean, currentPrice: number) {
    const flag = this.flags.get(flagId);
    if (!flag || flag.status !== 'PENDING') return;

    const pnl = isWin
      ? Number((flag.stakeSol * (flag.leverage * 0.05)).toFixed(3))
      : -flag.stakeSol;

    flag.status = isWin ? 'WIN' : 'LOSS';
    flag.pnlSol = pnl;
    this.notifyFlags();

    this.broadcast('RESOLVE_FLAG', {
      flagId,
      status: flag.status,
      pnlSol: pnl,
      settlementPrice: currentPrice,
    });

    this.addTapeEntry({
      id: 'tape-' + Math.random().toString(36).substring(2, 9),
      roomId: flag.roomId,
      timestamp: Date.now(),
      playerName: flag.playerName,
      playerAvatar: flag.playerAvatar,
      action: isWin ? 'TAKE_PROFIT' : 'LIQUIDATED',
      detail: isWin
        ? `Target hit @ $${currentPrice.toFixed(2)} (+${pnl} SOL)`
        : `Wick stopped flag @ $${currentPrice.toFixed(2)} (-${flag.stakeSol} SOL)`,
      pnl,
      color: isWin ? '#00FF66' : '#FF3366',
    });

    // Update trade outcome in Supabase
    supabaseService.resolveTrade(flag.id, flag.playerId, isWin, pnl);

    // Real on-chain settlement & Devnet SOL payout via protocol keeper
    fetch('/api/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: flag.roomId,
        playerAddress: flag.playerId,
        isWin,
        settlementPrice: currentPrice,
        payoutAmountLamports: isWin ? Math.round(pnl * 1_000_000_000) : 0,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.signature) {
          flag.resolveTxSignature = data.signature;
          this.notifyFlags();
        }
        // Refresh balance to immediately reflect real payout
        solanaWalletService.refreshBalance();
      })
      .catch((err) => console.warn('On-chain settlement notification error:', err));
  }

  /**
   * 1-Click Copy or Fade trade
   */
  public copyTrade(
    followerId: string,
    followerName: string,
    followerAvatar: string,
    followerColor: string,
    targetFlagId: string,
    isFade: boolean = false,
    txSignature?: string
  ) {
    const target = this.flags.get(targetFlagId);
    if (!target) return;

    target.copiedCount = (target.copiedCount || 0) + 1;
    this.notifyFlags();

    const copiedType = isFade ? (target.type === 'LONG' ? 'SHORT' : 'LONG') : target.type;

    const newFlag: TapFlag = {
      id: txSignature ? 'tx-' + txSignature.slice(0, 10) : 'flag-' + Math.random().toString(36).substring(2, 9),
      roomId: this.currentRoomId,
      playerId: followerId,
      playerName: followerName,
      playerAvatar: followerAvatar,
      playerColor: followerColor,
      type: copiedType,
      price: target.price,
      stakeSol: target.stakeSol,
      leverage: target.leverage,
      timestamp: Date.now(),
      copiedCount: 0,
      status: 'PENDING',
      txSignature,
    };

    this.broadcastFlag(newFlag);

    this.broadcast('COPY_TRADE', {
      followerName,
      followerAvatar,
      targetName: target.playerName,
      leverage: target.leverage,
      type: copiedType,
      isFade,
    });

    this.addTapeEntry({
      id: 'tape-' + Math.random().toString(36).substring(2, 9),
      roomId: this.currentRoomId,
      timestamp: Date.now(),
      playerName: followerName,
      playerAvatar: followerAvatar,
      action: isFade ? 'FADED' : 'COPIED',
      detail: `${isFade ? 'Faded' : 'Copied'} ${target.playerName}'s ${target.leverage}x ${target.type}`,
      color: isFade ? '#FFE600' : '#00F0FF',
      txSignature,
    });
  }

  /**
   * Send emoji reaction
   */
  public sendTaunt(playerId: string, emoji: string) {
    this.broadcast('TAUNT', { playerId, emoji });
    const c = this.cursors.get(playerId);
    if (c) {
      c.tauntEmoji = emoji;
      c.tauntTimer = Date.now();
      this.notifyCursors();
      setTimeout(() => {
        if (c.tauntEmoji === emoji) {
          delete c.tauntEmoji;
          this.notifyCursors();
        }
      }, 2500);
    }
  }

  /**
   * Check if current market price crosses any flags to resolve them
   */
  public checkPriceWicks(currentPrice: number) {
    const tolerance = 0.35; // $0.35 price wick threshold
    this.flags.forEach((flag) => {
      if (flag.status !== 'PENDING') return;

      const priceDiff = Math.abs(currentPrice - flag.price);
      if (priceDiff <= tolerance) {
        const isWin = flag.type === 'LONG' ? currentPrice >= flag.price : currentPrice <= flag.price;
        this.resolveFlag(flag.id, isWin, currentPrice);
      }
    });
  }

  private addTapeEntry(entry: TapeEntry) {
    this.tapeEntries.unshift(entry);
    if (this.tapeEntries.length > 50) this.tapeEntries.pop();
    this.notifyTape();
  }

  private cleanupStaleCursors() {
    const now = Date.now();
    let changed = false;
    this.cursors.forEach((cursor, id) => {
      if (now - cursor.lastUpdated > 12000) {
        this.cursors.delete(id);
        changed = true;
      }
    });
    if (changed) {
      this.notifyCursors();
    }
  }

  private notifyCursors() {
    const list = Array.from(this.cursors.values());
    this.cursorListeners.forEach((cb) => cb(list));
  }

  private notifyFlags() {
    const list = Array.from(this.flags.values());
    this.flagListeners.forEach((cb) => cb(list));
  }

  private notifyTape() {
    const list = [...this.tapeEntries];
    this.tapeListeners.forEach((cb) => cb(list));
  }
}

export const multiplayerService = new MultiplayerService();
