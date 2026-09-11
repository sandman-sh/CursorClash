import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;


export interface DbProfile {
  wallet_address: string;
  display_name: string;
  avatar: string;
  total_pnl: number;
  win_count: number;
  loss_count: number;
  created_at?: string;
  updated_at?: string;
}

export interface DbTradeLog {
  id: string;
  room_id: string;
  player_address: string;
  player_name: string;
  type: 'LONG' | 'SHORT';
  target_price: number;
  stake_sol: number;
  leverage: number;
  status: 'PENDING' | 'WIN' | 'LOSS';
  pnl_sol: number;
  created_at?: string;
}

export interface DbRoom {
  id: string;
  name: string;
  is_private: boolean;
  passcode?: string;
  created_by?: string;
  created_at?: string;
}

class SupabaseDataService {
  /**
   * Upsert a player's on-chain profile and historical performance
   */
  public async upsertProfile(profile: Partial<DbProfile> & { wallet_address: string }): Promise<void> {
    if (!supabase) return;
    try {
      await supabase.from('profiles').upsert(
        {
          ...profile,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'wallet_address' }
      );
    } catch (err) {
      console.warn('Supabase upsertProfile error:', err);
    }
  }

  /**
   * Fetch top traders ranked by total PnL from Supabase
   */
  public async getLeaderboard(limit: number = 10): Promise<DbProfile[]> {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('total_pnl', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn('Supabase getLeaderboard error:', err);
      return [];
    }
  }

  /**
   * Log an executed tap trade
   */
  public async logTrade(trade: DbTradeLog): Promise<void> {
    if (!supabase) return;
    try {
      await supabase.from('trade_logs').insert([trade]);
    } catch (err) {
      console.warn('Supabase logTrade error:', err);
    }
  }

  /**
   * Update trade outcome on settlement and increment player record
   */
  public async resolveTrade(
    tradeId: string,
    playerAddress: string,
    isWin: boolean,
    pnlSol: number
  ): Promise<void> {
    if (!supabase) return;
    try {
      // 1. Update trade record
      await supabase
        .from('trade_logs')
        .update({
          status: isWin ? 'WIN' : 'LOSS',
          pnl_sol: pnlSol,
        })
        .eq('id', tradeId);

      // 2. Fetch current profile to increment
      const { data: existing } = await supabase
        .from('profiles')
        .select('*')
        .eq('wallet_address', playerAddress)
        .single();

      if (existing) {
        await supabase
          .from('profiles')
          .update({
            total_pnl: Number(((existing.total_pnl || 0) + pnlSol).toFixed(4)),
            win_count: isWin ? (existing.win_count || 0) + 1 : existing.win_count,
            loss_count: !isWin ? (existing.loss_count || 0) + 1 : existing.loss_count,
            updated_at: new Date().toISOString(),
          })
          .eq('wallet_address', playerAddress);
      }
    } catch (err) {
      console.warn('Supabase resolveTrade error:', err);
    }
  }

  /**
   * Fetch active public and private rooms
   */
  public async getRooms(): Promise<DbRoom[]> {
    if (!supabase) {
      return [
        { id: 'trench-1', name: 'SOL/USDC 100X Wicks', is_private: false },
        { id: 'trench-2', name: 'BONK Volatility Arena', is_private: false },
        { id: 'trench-3', name: 'Global Trading Hub', is_private: false },
      ];
    }
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn('Supabase getRooms error:', err);
      return [
        { id: 'trench-1', name: 'SOL/USDC 100X Wicks', is_private: false },
        { id: 'trench-2', name: 'BONK Volatility Arena', is_private: false },
        { id: 'trench-3', name: 'Global Trading Hub', is_private: false },
      ];
    }
  }

  /**
   * Create a new custom or private room
   */
  public async createRoom(room: DbRoom): Promise<boolean> {
    if (!supabase) return false;
    try {
      const { error } = await supabase.from('rooms').insert([room]);
      if (error) throw error;
      return true;
    } catch (err) {
      console.warn('Supabase createRoom error:', err);
      return false;
    }
  }
}

export const supabaseService = new SupabaseDataService();
