/**
 * Real-Time Multiplayer Cursor & Event Synchronization Service
 * Tri-layer synchronization mesh:
 * 1. Supabase Realtime Channels (Global cross-browser, cross-device, production-ready)
 * 2. Local WebSocket Relay (Ultra-fast localhost dev relay)
 * 3. Native BroadcastChannel (Zero-latency cross-tab fallback)
 *
 * Includes automatic room presence, join announcements, and clock-skew resilient cursor tracking.
 */

import { supabase, supabaseService, type DbTradeLog } from './supabase';
import { solanaWalletService } from './solana';

export interface RemoteCursor {
  sessionId?: string;
  playerId: string;
  name: string;
  avatar: string;
  color: string;
  x: number; // 0 to 1 relative canvas position
  y: number; // 0 to 1 relative canvas position
  lastUpdated: number;
  lastReceivedAt?: number;
  tauntEmoji?: string;
  tauntTimer?: number;
  isSimulated?: boolean;
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
  type: 'CURSOR_MOVE' | 'NEW_FLAG' | 'RESOLVE_FLAG' | 'TAUNT' | 'COPY_TRADE' | 'PLAYER_LEAVE' | 'PLAYER_JOIN' | 'PLAYER_STATE';
  payload: any;
}

class MultiplayerService {
  private channel: BroadcastChannel | null = null;
  private ws: WebSocket | null = null;
  private supabaseChannel: any = null;
  private tabId: string;
  private currentRoomId: string = 'trench-1';
  private cursors: Map<string, RemoteCursor> = new Map();
  private flags: Map<string, TapFlag> = new Map();
  private tapeEntries: TapeEntry[] = [];
  private processedMsgIds: Set<string> = new Set();

  private cursorListeners: Set<EventCallback<RemoteCursor[]>> = new Set();
  private flagListeners: Set<EventCallback<TapFlag[]>> = new Set();
  private tapeListeners: Set<EventCallback<TapeEntry[]>> = new Set();

  private ambientInterval: any = null;
  private lastBroadcastTime: number = 0;
  private pendingCursorBroadcast: any = null;
  private latestLocalCursor: RemoteCursor | null = null;

  constructor() {
    this.tabId = 'tab_' + Math.random().toString(36).substring(2, 9);

    // 1. Cross-tab BroadcastChannel
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        this.channel = new BroadcastChannel('cursorclash_multiplayer_channel');
        this.channel.onmessage = (e) => this.handleIncomingMessage(e.data);
      }
    } catch (err) {
      console.warn('BroadcastChannel not supported:', err);
    }

    // 2. Cross-browser WebSocket relay (local fallback)
    this.initWebSocket();

    // 3. Supabase Realtime Channel (Global cross-browser & cross-device backbone)
    this.initSupabaseChannel(this.currentRoomId);

    // 4. Start ambient peer cursors for public arenas
    this.initAmbientTraders();

    // 5. Stale cursor cleanup (removes inactive peers)
    if (typeof window !== 'undefined') {
      setInterval(() => this.cleanupStaleCursors(), 2500);

      // Periodic presence heartbeat so sitting idle doesn't make cursor vanish
      setInterval(() => {
        if (this.latestLocalCursor) {
          this.broadcast('CURSOR_MOVE', this.latestLocalCursor);
        }
      }, 3000);

      // Clean departure when closing tab or browser
      window.addEventListener('beforeunload', () => {
        this.broadcast('PLAYER_LEAVE', {
          sessionId: this.tabId,
          playerId: this.latestLocalCursor?.playerId || this.tabId,
        });
      });
    }
  }

  public getTabId(): string {
    return this.tabId;
  }

  public getRoom(): string {
    return this.currentRoomId;
  }

  public setRoom(roomId: string) {
    if (this.currentRoomId === roomId) return;

    // Notify peers in old room of departure
    this.broadcast('PLAYER_LEAVE', {
      sessionId: this.tabId,
      playerId: this.latestLocalCursor?.playerId || this.tabId,
    });

    this.currentRoomId = roomId;

    // Reset local canvas state for the new room
    this.cursors.clear();
    this.flags.clear();
    this.tapeEntries = [];

    // Re-connect Supabase channel for the new room
    this.initSupabaseChannel(roomId);

    // Re-initialize ambient traders if public room
    this.initAmbientTraders();

    this.notifyCursors();
    this.notifyFlags();
    this.notifyTape();

    // Announce arrival in the new room
    setTimeout(() => {
      this.announcePresence();
    }, 400);
  }

  /**
   * Supabase Realtime Channel for Global Cross-Browser & Cross-Device Mesh
   */
  private initSupabaseChannel(roomId: string) {
    if (!supabase) return;

    try {
      if (this.supabaseChannel) {
        this.supabaseChannel.unsubscribe();
        this.supabaseChannel = null;
      }

      const channelName = `arena_${roomId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      this.supabaseChannel = supabase.channel(channelName, {
        config: {
          broadcast: { self: false },
        },
      });

      this.supabaseChannel
        .on('broadcast', { event: 'CURSOR_MOVE' }, ({ payload }: any) => {
          this.handleIncomingMessage({
            id: payload?.id || `sb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            roomId: this.currentRoomId,
            sourceTabId: payload?.sessionId || '',
            type: 'CURSOR_MOVE',
            payload,
          });
        })
        .on('broadcast', { event: 'SYNC_MSG' }, ({ payload }: any) => {
          this.handleIncomingMessage(payload);
        })
        .on('broadcast', { event: 'PLAYER_JOIN' }, ({ payload }: any) => {
          this.handlePlayerJoin(payload);
        })
        .on('broadcast', { event: 'PLAYER_LEAVE' }, ({ payload }: any) => {
          this.handlePlayerLeave(payload);
        })
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            this.announcePresence();
          }
        });
    } catch (err) {
      console.warn('Supabase Realtime Channel error:', err);
    }
  }

  private announcePresence() {
    const payload = {
      sessionId: this.tabId,
      roomId: this.currentRoomId,
      cursor: this.latestLocalCursor,
      timestamp: Date.now(),
    };

    // Broadcast JOIN event across all channels
    this.broadcast('PLAYER_JOIN', payload);
  }

  private handlePlayerJoin(payload: any) {
    if (!payload || payload.sessionId === this.tabId) return;

    // New player joined! If they sent their cursor, record it
    if (payload.cursor) {
      this.recordRemoteCursor(payload.cursor);
    }

    // Greet the new player by sending back our current position & active flags
    if (this.latestLocalCursor) {
      this.broadcast('CURSOR_MOVE', this.latestLocalCursor);
    }

    // Also share active pending flags with the newcomer
    const activeFlags = Array.from(this.flags.values()).filter((f) => f.status === 'PENDING');
    activeFlags.forEach((flag) => {
      this.broadcast('NEW_FLAG', flag);
    });
  }

  private handlePlayerLeave(payload: any) {
    if (!payload) return;
    const key = payload.sessionId || payload.playerId;
    if (key && this.cursors.has(key)) {
      this.cursors.delete(key);
      this.notifyCursors();
    }
  }

  private initAmbientTraders() {
    if (typeof window === 'undefined') return;
    if (this.ambientInterval) {
      clearInterval(this.ambientInterval);
      this.ambientInterval = null;
    }

    // In private squads, only real human players appear
    if (this.currentRoomId.startsWith('squad-')) {
      return;
    }

    const ambientPeers: RemoteCursor[] = [
      {
        sessionId: 'sim_whale',
        playerId: 'sim_whale',
        name: 'DegenWhale.sol',
        avatar: '🐋',
        color: '#00FF66',
        x: 0.62,
        y: 0.42,
        lastUpdated: Date.now(),
        lastReceivedAt: Date.now(),
        isSimulated: true,
      },
      {
        sessionId: 'sim_sniper',
        playerId: 'sim_sniper',
        name: 'SolSniper.sol',
        avatar: '⚡',
        color: '#FFE600',
        x: 0.45,
        y: 0.52,
        lastUpdated: Date.now(),
        lastReceivedAt: Date.now(),
        isSimulated: true,
      },
      {
        sessionId: 'sim_chad',
        playerId: 'sim_chad',
        name: 'AlphaChad.sol',
        avatar: '🚀',
        color: '#00F0FF',
        x: 0.78,
        y: 0.38,
        lastUpdated: Date.now(),
        lastReceivedAt: Date.now(),
        isSimulated: true,
      },
    ];

    ambientPeers.forEach((p) => this.cursors.set(p.sessionId!, p));
    this.notifyCursors();

    const velocities = [
      { vx: 0.002, vy: 0.0015 },
      { vx: -0.0018, vy: 0.0022 },
      { vx: 0.0022, vy: -0.0018 },
    ];

    this.ambientInterval = setInterval(() => {
      let changed = false;
      ambientPeers.forEach((peer, i) => {
        const vel = velocities[i];
        peer.x += vel.vx + (Math.random() - 0.5) * 0.004;
        peer.y += vel.vy + (Math.random() - 0.5) * 0.004;

        if (peer.x < 0.12) { peer.x = 0.12; vel.vx = Math.abs(vel.vx); }
        if (peer.x > 0.88) { peer.x = 0.88; vel.vx = -Math.abs(vel.vx); }
        if (peer.y < 0.18) { peer.y = 0.18; vel.vy = Math.abs(vel.vy); }
        if (peer.y > 0.75) { peer.y = 0.75; vel.vy = -Math.abs(vel.vy); }

        peer.lastUpdated = Date.now();
        peer.lastReceivedAt = Date.now();
        this.cursors.set(peer.sessionId!, peer);
        changed = true;

        if (Math.random() < 0.008 && !peer.tauntTimer) {
          const emojis = ['🚀', '🔥', '💎', '🎯', '⚡'];
          peer.tauntEmoji = emojis[Math.floor(Math.random() * emojis.length)];
          peer.tauntTimer = Date.now();
          setTimeout(() => {
            delete peer.tauntEmoji;
            delete peer.tauntTimer;
            this.notifyCursors();
          }, 2400);
        }
      });

      if (changed) {
        this.notifyCursors();
      }
    }, 120);
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
          const dataStr = typeof event.data === 'string' ? event.data : '';
          if (dataStr) {
            const data = JSON.parse(dataStr);
            this.handleIncomingMessage(data);
          }
        } catch {
          // ignore malformed payloads
        }
      };

      this.ws.onclose = () => {
        setTimeout(() => this.initWebSocket(), 4000);
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      // fallback to BroadcastChannel & Supabase
    }
  }

  /**
   * Broadcast across Supabase Realtime + WebSocket + BroadcastChannel
   */
  private broadcast(type: SyncMessage['type'], payload: any) {
    const msg: SyncMessage = {
      id: `${this.tabId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      roomId: this.currentRoomId,
      sourceTabId: this.tabId,
      type,
      payload,
    };

    this.processedMsgIds.add(msg.id);
    if (this.processedMsgIds.size > 300) {
      const first = this.processedMsgIds.values().next().value;
      if (first) this.processedMsgIds.delete(first);
    }

    // 1. Supabase Realtime Channel Broadcast
    if (this.supabaseChannel) {
      try {
        if (type === 'CURSOR_MOVE') {
          this.supabaseChannel.send({
            type: 'broadcast',
            event: 'CURSOR_MOVE',
            payload,
          });
        } else if (type === 'PLAYER_JOIN') {
          this.supabaseChannel.send({
            type: 'broadcast',
            event: 'PLAYER_JOIN',
            payload,
          });
        } else if (type === 'PLAYER_LEAVE') {
          this.supabaseChannel.send({
            type: 'broadcast',
            event: 'PLAYER_LEAVE',
            payload,
          });
        } else {
          this.supabaseChannel.send({
            type: 'broadcast',
            event: 'SYNC_MSG',
            payload: msg,
          });
        }
      } catch (err) {
        console.warn('Supabase broadcast error:', err);
      }
    }

    // 2. Cross-tab BroadcastChannel
    if (this.channel) {
      try {
        this.channel.postMessage(msg);
      } catch (err) {
        console.warn('BroadcastChannel error:', err);
      }
    }

    // 3. Local WebSocket Relay
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
    if (this.processedMsgIds.has(msg.id)) return; // duplicate protection

    this.processedMsgIds.add(msg.id);
    if (this.processedMsgIds.size > 300) {
      const first = this.processedMsgIds.values().next().value;
      if (first) this.processedMsgIds.delete(first);
    }

    switch (msg.type) {
      case 'CURSOR_MOVE': {
        this.recordRemoteCursor(msg.payload);
        break;
      }
      case 'PLAYER_JOIN': {
        this.handlePlayerJoin(msg.payload);
        break;
      }
      case 'PLAYER_LEAVE': {
        this.handlePlayerLeave(msg.payload);
        break;
      }
      case 'NEW_FLAG': {
        const flag: TapFlag = msg.payload;
        this.flags.set(flag.id, flag);
        this.notifyFlags();
        this.addTapeEntry({
          id: 'tape-' + Math.random().toString(36).substring(2, 9),
          roomId: flag.roomId,
          timestamp: flag.timestamp || Date.now(),
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
    }
  }

  private recordRemoteCursor(c: RemoteCursor) {
    if (!c) return;
    if (c.sessionId === this.tabId) return; // Don't record own broadcast

    const key = c.sessionId || c.playerId;
    if (!key) return;

    const updatedCursor: RemoteCursor = {
      ...c,
      sessionId: c.sessionId || key,
      lastReceivedAt: Date.now(), // Local clock timestamp to protect against clock skew
    };

    this.cursors.set(key, updatedCursor);
    this.notifyCursors();
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
   * Broadcast real player cursor position within current room.
   * Updates local map immediately and throttles network broadcast to 30ms (33fps).
   */
  public broadcastCursor(cursor: RemoteCursor) {
    const fullCursor: RemoteCursor = {
      ...cursor,
      sessionId: this.tabId,
      lastUpdated: Date.now(),
      lastReceivedAt: Date.now(),
    };

    this.latestLocalCursor = fullCursor;

    // 1. Immediately store in local cursors map so local cursor rendering is instantaneous
    this.cursors.set(this.tabId, fullCursor);
    this.notifyCursors();

    // 2. Throttle network broadcast to ~30ms to prevent network/rate-limit flooding
    const now = Date.now();
    if (now - this.lastBroadcastTime >= 30) {
      this.lastBroadcastTime = now;
      this.broadcast('CURSOR_MOVE', fullCursor);
    } else {
      if (!this.pendingCursorBroadcast) {
        this.pendingCursorBroadcast = setTimeout(() => {
          this.pendingCursorBroadcast = null;
          this.lastBroadcastTime = Date.now();
          if (this.latestLocalCursor) {
            this.broadcast('CURSOR_MOVE', this.latestLocalCursor);
          }
        }, 32);
      }
    }
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
      // Don't delete simulated traders
      if (cursor.isSimulated) return;
      // Don't delete local player's own cursor
      if (cursor.sessionId === this.tabId) return;

      // Check against local reception timestamp (protects against clock skew)
      const lastActive = cursor.lastReceivedAt || cursor.lastUpdated || 0;
      if (now - lastActive > 25000) {
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
