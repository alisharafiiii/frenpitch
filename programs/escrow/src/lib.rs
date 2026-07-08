// frenpitch escrow — minimal tournament prize-pool vault (devnet)
//
// design (scoped for a 12-day hackathon, honest about trust):
//   create_tournament : creator configures buy-in, split, deadline; PDA vault owns the USDC
//   join              : invited fren deposits buy-in into the vault
//   settle            : oracle authority (our backend, fed by txline events) posts winners;
//                       program pays out per the split config and closes
//   refund            : if not settled by deadline + 48h grace, ANYONE can trigger
//                       full refunds — trustless escape hatch, no faith in us required
//
// deliberately skipped: disputes, partial withdrawals, multi-token, onchain result proofs.
// oracle-signed settlement is stated plainly in the tech doc.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("Fren11111111111111111111111111111111111111");

const MAX_PARTICIPANTS: usize = 16;
const REFUND_GRACE_SECS: i64 = 48 * 60 * 60;

#[program]
pub mod frenpitch_escrow {
    use super::*;

    pub fn create_tournament(
        ctx: Context<CreateTournament>,
        tournament_id: u64,
        buy_in: u64,          // in USDC base units (6 dp)
        split: PrizeSplit,
        deadline: i64,        // unix ts — expected settle-by time
        max_participants: u8,
    ) -> Result<()> {
        require!(buy_in > 0, EscrowError::InvalidConfig);
        require!(
            (max_participants as usize) <= MAX_PARTICIPANTS,
            EscrowError::InvalidConfig
        );

        let t = &mut ctx.accounts.tournament;
        t.tournament_id = tournament_id;
        t.creator = ctx.accounts.creator.key();
        t.oracle = ctx.accounts.oracle.key();
        t.mint = ctx.accounts.mint.key();
        t.buy_in = buy_in;
        t.split = split;
        t.deadline = deadline;
        t.max_participants = max_participants;
        t.participants = vec![];
        t.status = TournamentStatus::Open;
        t.bump = ctx.bumps.tournament;
        Ok(())
    }

    pub fn join(ctx: Context<Join>) -> Result<()> {
        let t = &mut ctx.accounts.tournament;
        require!(t.status == TournamentStatus::Open, EscrowError::NotOpen);
        require!(
            (t.participants.len() as u8) < t.max_participants,
            EscrowError::Full
        );
        let joiner = ctx.accounts.joiner.key();
        require!(!t.participants.contains(&joiner), EscrowError::AlreadyJoined);

        // deposit buy-in into the PDA-owned vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.joiner_token.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.joiner.to_account_info(),
                },
            ),
            t.buy_in,
        )?;

        t.participants.push(joiner);
        Ok(())
    }

    /// oracle posts final standings (winners ordered 1st..nth).
    /// backend derives standings deterministically from recorded txline events;
    /// same engine settles solo point-picks off-chain.
    pub fn settle<'info>(
        ctx: Context<'_, '_, 'info, 'info, Settle<'info>>,
        winners: Vec<Pubkey>,
    ) -> Result<()> {
        let t = &ctx.accounts.tournament;
        require!(t.status == TournamentStatus::Open, EscrowError::NotOpen);
        for w in &winners {
            require!(t.participants.contains(w), EscrowError::UnknownWinner);
        }

        let pool = ctx.accounts.vault.amount;
        let shares: Vec<u64> = match t.split {
            PrizeSplit::WinnerTakeAll => vec![pool],
            PrizeSplit::Split702010 => vec![pool * 70 / 100, pool * 20 / 100, pool * 10 / 100],
            PrizeSplit::EvenTop3 => vec![pool / 3, pool / 3, pool - 2 * (pool / 3)],
        };
        require!(winners.len() >= shares.len(), EscrowError::InvalidConfig);

        // remaining_accounts: winner token accounts, same order as `winners`
        let seeds: &[&[u8]] = &[
            b"tournament",
            &t.tournament_id.to_le_bytes(),
            &[t.bump],
        ];
        for (i, share) in shares.iter().enumerate() {
            let winner_token = &ctx.remaining_accounts[i];
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: winner_token.to_account_info(),
                        authority: ctx.accounts.tournament.to_account_info(),
                    },
                    &[seeds],
                ),
                *share,
            )?;
        }

        ctx.accounts.tournament.status = TournamentStatus::Settled;
        Ok(())
    }

    /// permissionless refund after deadline + grace: everyone gets buy_in back.
    pub fn refund<'info>(ctx: Context<'_, '_, 'info, 'info, Refund<'info>>) -> Result<()> {
        let t = &ctx.accounts.tournament;
        require!(t.status == TournamentStatus::Open, EscrowError::NotOpen);
        let now = Clock::get()?.unix_timestamp;
        require!(now > t.deadline + REFUND_GRACE_SECS, EscrowError::TooEarly);

        // remaining_accounts: participant token accounts, same order as t.participants
        let seeds: &[&[u8]] = &[
            b"tournament",
            &t.tournament_id.to_le_bytes(),
            &[t.bump],
        ];
        let buy_in = t.buy_in;
        for (i, _) in t.participants.iter().enumerate() {
            let participant_token = &ctx.remaining_accounts[i];
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: participant_token.to_account_info(),
                        authority: ctx.accounts.tournament.to_account_info(),
                    },
                    &[seeds],
                ),
                buy_in,
            )?;
        }

        ctx.accounts.tournament.status = TournamentStatus::Refunded;
        Ok(())
    }
}

// ---------- state ----------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum PrizeSplit {
    WinnerTakeAll,
    Split702010,
    EvenTop3,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum TournamentStatus {
    Open,
    Settled,
    Refunded,
}

#[account]
pub struct Tournament {
    pub tournament_id: u64,
    pub creator: Pubkey,
    pub oracle: Pubkey,
    pub mint: Pubkey,
    pub buy_in: u64,
    pub split: PrizeSplit,
    pub deadline: i64,
    pub max_participants: u8,
    pub participants: Vec<Pubkey>,
    pub status: TournamentStatus,
    pub bump: u8,
}

impl Tournament {
    pub const SPACE: usize = 8 + 8 + 32 + 32 + 32 + 8 + 1 + 8 + 1 + (4 + 32 * MAX_PARTICIPANTS) + 1 + 1;
}

// ---------- contexts ----------

#[derive(Accounts)]
#[instruction(tournament_id: u64)]
pub struct CreateTournament<'info> {
    #[account(
        init,
        payer = creator,
        space = Tournament::SPACE,
        seeds = [b"tournament", tournament_id.to_le_bytes().as_ref()],
        bump
    )]
    pub tournament: Account<'info, Tournament>,
    #[account(
        init,
        payer = creator,
        token::mint = mint,
        token::authority = tournament,
        seeds = [b"vault", tournament_id.to_le_bytes().as_ref()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,
    /// CHECK: oracle pubkey stored for settle authorization
    pub oracle: UncheckedAccount<'info>,
    pub mint: Account<'info, anchor_spl::token::Mint>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Join<'info> {
    #[account(mut)]
    pub tournament: Account<'info, Tournament>,
    #[account(mut, constraint = vault.owner == tournament.key())]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, constraint = joiner_token.owner == joiner.key())]
    pub joiner_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub joiner: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(mut)]
    pub tournament: Account<'info, Tournament>,
    #[account(mut, constraint = vault.owner == tournament.key())]
    pub vault: Account<'info, TokenAccount>,
    #[account(constraint = oracle.key() == tournament.oracle @ EscrowError::BadOracle)]
    pub oracle: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut)]
    pub tournament: Account<'info, Tournament>,
    #[account(mut, constraint = vault.owner == tournament.key())]
    pub vault: Account<'info, TokenAccount>,
    /// anyone can crank refunds — permissionless by design
    pub cranker: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

// ---------- errors ----------

#[error_code]
pub enum EscrowError {
    #[msg("invalid tournament config")]
    InvalidConfig,
    #[msg("tournament not open")]
    NotOpen,
    #[msg("tournament full")]
    Full,
    #[msg("already joined")]
    AlreadyJoined,
    #[msg("winner not a participant")]
    UnknownWinner,
    #[msg("unauthorized oracle")]
    BadOracle,
    #[msg("refund window not reached")]
    TooEarly,
}
