use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;

declare_id!("AvmjRWFevdy6WK7D2towMreTFtMKijCGEKMSK7j9rgSP");

#[ephemeral]
#[program]
pub mod cursorclash {
    use super::*;

    /// Initialize a new multiplayer trading arena room on Solana L1
    pub fn initialize_arena(
        ctx: Context<InitializeArena>,
        room_id: String,
        base_asset: String,
        initial_price: u64,
    ) -> Result<()> {
        let arena = &mut ctx.accounts.arena;
        arena.authority = ctx.accounts.authority.key();
        arena.room_id = room_id;
        arena.base_asset = base_asset;
        arena.current_price = initial_price;
        arena.total_volume = 0;
        arena.total_trades = 0;
        arena.active_players = 0;
        arena.is_delegated = false;
        arena.bump = ctx.bumps.arena;
        Ok(())
    }

    /// Delegate the arena account to the MagicBlock Ephemeral Rollup
    /// Enables sub-50ms gasless tap trading and high-frequency multiplayer updates
    pub fn delegate_arena(ctx: Context<DelegateArena>) -> Result<()> {
        // Delegate account state management to MagicBlock ER validator
        let pda_seeds: &[&[u8]] = &[
            b"arena",
            ctx.accounts.arena.room_id.as_bytes(),
            &[ctx.accounts.arena.bump],
        ];

        ctx.accounts.delegate_arena(
            &ctx.accounts.payer,
            pda_seeds,
            DelegateConfig::default(),
        )?;

        ctx.accounts.arena.is_delegated = true;
        msg!("Arena account successfully delegated to MagicBlock Ephemeral Rollup!");
        Ok(())
    }

    /// High-frequency tap trade executed directly inside Ephemeral Rollup with zero gas fees
    pub fn place_tap_flag(
        ctx: Context<PlaceTapFlag>,
        flag_type: u8, // 0 = Long, 1 = Short
        target_price: u64,
        stake_amount: u64,
        leverage: u8,
    ) -> Result<()> {
        let arena = &mut ctx.accounts.arena;
        let player_state = &mut ctx.accounts.player_state;

        player_state.owner = ctx.accounts.player.key();
        player_state.flag_type = flag_type;
        player_state.target_price = target_price;
        player_state.stake_amount = stake_amount;
        player_state.leverage = leverage;
        player_state.is_active = true;
        player_state.timestamp = Clock::get()?.unix_timestamp;

        arena.total_trades = arena.total_trades.saturating_add(1);
        arena.total_volume = arena.total_volume.saturating_add(stake_amount);

        emit!(TapFlagPlacedEvent {
            player: ctx.accounts.player.key(),
            flag_type,
            target_price,
            stake_amount,
            leverage,
        });

        Ok(())
    }

    /// 1-Click Copy Trade: Instantly mirror another player's flag in the Ephemeral Rollup
    pub fn copy_trade_flag(
        ctx: Context<CopyTradeFlag>,
        copied_player: Pubkey,
        stake_amount: u64,
    ) -> Result<()> {
        let arena = &mut ctx.accounts.arena;
        let follower_state = &mut ctx.accounts.follower_state;
        let target_state = &ctx.accounts.target_state;

        require!(target_state.is_active, ErrorCode::TargetFlagInactive);

        follower_state.owner = ctx.accounts.follower.key();
        follower_state.flag_type = target_state.flag_type;
        follower_state.target_price = target_state.target_price;
        follower_state.stake_amount = stake_amount;
        follower_state.leverage = target_state.leverage;
        follower_state.is_active = true;
        follower_state.timestamp = Clock::get()?.unix_timestamp;

        arena.total_trades = arena.total_trades.saturating_add(1);

        emit!(TradeCopiedEvent {
            follower: ctx.accounts.follower.key(),
            copied_player,
            flag_type: target_state.flag_type,
            target_price: target_state.target_price,
        });

        Ok(())
    }

    /// Real-time wick settlement when price crosses tap flags inside the Rollup
    pub fn resolve_flag(
        ctx: Context<ResolveFlag>,
        settlement_price: u64,
        is_win: bool,
        payout_amount: u64,
    ) -> Result<()> {
        let player_state = &mut ctx.accounts.player_state;
        let arena = &mut ctx.accounts.arena;

        require!(player_state.is_active, ErrorCode::FlagAlreadyResolved);

        player_state.is_active = false;
        arena.current_price = settlement_price;

        if is_win {
            player_state.realized_pnl = player_state.realized_pnl.saturating_add(payout_amount as i64);
        } else {
            player_state.realized_pnl = player_state.realized_pnl.saturating_sub(player_state.stake_amount as i64);
        }

        emit!(FlagResolvedEvent {
            player: player_state.owner,
            settlement_price,
            is_win,
            payout_amount,
        });

        Ok(())
    }

    /// Commit accounts back to Solana L1 and undelegate rollup session
    pub fn commit_and_undelegate(ctx: Context<CommitAndUndelegate>) -> Result<()> {
        // Undelegate account and commit final states back to Solana L1
        let arena_info = ctx.accounts.arena.to_account_info();
        let payer_info = ctx.accounts.payer.to_account_info();
        let magic_program_info = ctx.accounts.magic_program.to_account_info();
        ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts(
            &payer_info,
            vec![&arena_info],
            &ctx.accounts.magic_context,
            &magic_program_info,
        )?;
        ctx.accounts.arena.is_delegated = false;
        msg!("Arena state committed atomically to Solana L1!");
        Ok(())
    }
}

// -----------------------------------------------------------------------------
// Account Contexts
// -----------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(room_id: String)]
pub struct InitializeArena<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + ArenaAccount::INIT_SPACE,
        seeds = [b"arena", room_id.as_bytes()],
        bump
    )]
    pub arena: Account<'info, ArenaAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateArena<'info> {
    #[account(mut, del, has_one = authority)]
    pub arena: Account<'info, ArenaAccount>,
    pub authority: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
}

#[derive(Accounts)]
pub struct PlaceTapFlag<'info> {
    #[account(mut)]
    pub arena: Account<'info, ArenaAccount>,
    #[account(
        init_if_needed,
        payer = player,
        space = 8 + PlayerStateAccount::INIT_SPACE,
        seeds = [b"player", arena.key().as_ref(), player.key().as_ref()],
        bump
    )]
    pub player_state: Account<'info, PlayerStateAccount>,
    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CopyTradeFlag<'info> {
    #[account(mut)]
    pub arena: Account<'info, ArenaAccount>,
    #[account(mut)]
    pub target_state: Account<'info, PlayerStateAccount>,
    #[account(
        init_if_needed,
        payer = follower,
        space = 8 + PlayerStateAccount::INIT_SPACE,
        seeds = [b"player", arena.key().as_ref(), follower.key().as_ref()],
        bump
    )]
    pub follower_state: Account<'info, PlayerStateAccount>,
    #[account(mut)]
    pub follower: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResolveFlag<'info> {
    #[account(mut)]
    pub arena: Account<'info, ArenaAccount>,
    #[account(mut)]
    pub player_state: Account<'info, PlayerStateAccount>,
}

#[commit]
#[derive(Accounts)]
pub struct CommitAndUndelegate<'info> {
    #[account(mut, has_one = authority)]
    pub arena: Account<'info, ArenaAccount>,
    pub authority: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
}

// -----------------------------------------------------------------------------
// State Structures
// -----------------------------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct ArenaAccount {
    pub authority: Pubkey,
    #[max_len(32)]
    pub room_id: String,
    #[max_len(16)]
    pub base_asset: String,
    pub current_price: u64,
    pub total_volume: u64,
    pub total_trades: u64,
    pub active_players: u32,
    pub is_delegated: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct PlayerStateAccount {
    pub owner: Pubkey,
    pub flag_type: u8,
    pub target_price: u64,
    pub stake_amount: u64,
    pub leverage: u8,
    pub realized_pnl: i64,
    pub is_active: bool,
    pub timestamp: i64,
}

// -----------------------------------------------------------------------------
// Events & Errors
// -----------------------------------------------------------------------------

#[event]
pub struct TapFlagPlacedEvent {
    pub player: Pubkey,
    pub flag_type: u8,
    pub target_price: u64,
    pub stake_amount: u64,
    pub leverage: u8,
}

#[event]
pub struct TradeCopiedEvent {
    pub follower: Pubkey,
    pub copied_player: Pubkey,
    pub flag_type: u8,
    pub target_price: u64,
}

#[event]
pub struct FlagResolvedEvent {
    pub player: Pubkey,
    pub settlement_price: u64,
    pub is_win: bool,
    pub payout_amount: u64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("The target player's flag is no longer active.")]
    TargetFlagInactive,
    #[msg("This flag has already been resolved.")]
    FlagAlreadyResolved,
}
