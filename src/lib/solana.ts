import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { supabaseService } from './supabase';

export interface WalletProfile {
  id: string;
  name: string;
  address: string;
  shortAddress: string;
  color: string;
  avatar: string;
  balanceSol: number;
  walletType: 'PHANTOM' | 'SOLFLARE' | 'BACKPACK' | 'BURNER';
  isConnected: boolean;
  signature?: string;
}

export type DegenProfile = WalletProfile;

const DEVNET_RPC = 'https://api.devnet.solana.com';
const BURNER_STORAGE_KEY = 'cursorclash_devnet_burner_secret';
const LAST_WALLET_TYPE_KEY = 'cursorclash_wallet_type';

const AVATAR_POOL = ['⚡', '🎯', '🥷', '🧙‍♂️', '🚀', '💎', '🔥', '⚔️'];
const COLOR_POOL = ['#00FF66', '#00F0FF', '#FFE600', '#FF3366', '#A855F7', '#FF8800'];

function getDeterminism(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const abs = Math.abs(hash);
  return {
    avatar: AVATAR_POOL[abs % AVATAR_POOL.length],
    color: COLOR_POOL[abs % COLOR_POOL.length],
  };
}

class SolanaWalletService {
  private connection: Connection;
  private currentProfile: WalletProfile | null = null;
  private burnerKeypair: Keypair | null = null;
  private listeners: Set<(profile: WalletProfile | null) => void> = new Set();
  private balanceSubId: number | null = null;
  private isRefreshingBalance: boolean = false;

  constructor() {
    this.connection = new Connection(DEVNET_RPC, {
      commitment: 'confirmed',
      wsEndpoint: 'wss://api.devnet.solana.com',
    });

    this.initSavedWallet();
  }

  public getConnection(): Connection {
    return this.connection;
  }

  public getProfile(): WalletProfile | null {
    return this.currentProfile;
  }

  public isConnected(): boolean {
    return this.currentProfile !== null && this.currentProfile.isConnected;
  }

  public subscribe(callback: (profile: WalletProfile | null) => void): () => void {
    this.listeners.add(callback);
    callback(this.currentProfile);
    return () => this.listeners.delete(callback);
  }

  private notify() {
    this.listeners.forEach((cb) => cb(this.currentProfile));
  }

  private async initSavedWallet() {
    const savedType = localStorage.getItem(LAST_WALLET_TYPE_KEY);
    if (!savedType) return;

    try {
      if (savedType === 'BURNER') {
        await this.connectBurnerWallet();
      } else if (savedType === 'PHANTOM') {
        const anyWin = window as any;
        if (anyWin.solana?.isPhantom) {
          const resp = await anyWin.solana.connect({ onlyIfTrusted: true }).catch(() => null);
          if (resp?.publicKey) {
            await this.setupConnectedWallet(resp.publicKey.toString(), 'PHANTOM', 'Phantom Wallet');
          }
        }
      } else if (savedType === 'SOLFLARE') {
        const anyWin = window as any;
        if (anyWin.solflare?.isSolflare) {
          await anyWin.solflare.connect({ onlyIfTrusted: true }).catch(() => null);
          if (anyWin.solflare.publicKey) {
            await this.setupConnectedWallet(anyWin.solflare.publicKey.toString(), 'SOLFLARE', 'Solflare Wallet');
          }
        }
      }
    } catch (err) {
      console.warn('Auto-reconnect error:', err);
    }
  }

  /**
   * Connect to Phantom Wallet and authenticate with Sign-In with Solana
   */
  public async connectPhantom(): Promise<boolean> {
    const anyWin = window as any;
    const provider = anyWin.solana;

    if (!provider || !provider.isPhantom) {
      window.open('https://phantom.app/', '_blank');
      throw new Error('Phantom Wallet is not installed. Please install the Phantom browser extension.');
    }

    try {
      const resp = await provider.connect();
      const pubkey = resp.publicKey.toString();

      // Sign-In with Solana (SIWS) session verification
      let signature: string | undefined;
      try {
        const authMessage = `Sign to authenticate session with CursorClash Trading Protocol.\nAddress: ${pubkey}\nTimestamp: ${Date.now()}`;
        const encoded = new TextEncoder().encode(authMessage);
        const signed = await provider.signMessage(encoded, 'utf8');
        signature = bs58.encode(signed.signature);
      } catch {
        // Continue if user skips message signature
      }

      await this.setupConnectedWallet(pubkey, 'PHANTOM', 'Phantom Wallet', signature);
      localStorage.setItem(LAST_WALLET_TYPE_KEY, 'PHANTOM');

      provider.on('accountChanged', (newPubkey: any) => {
        if (newPubkey) {
          this.setupConnectedWallet(newPubkey.toString(), 'PHANTOM', 'Phantom Wallet');
        } else {
          this.disconnect();
        }
      });

      provider.on('disconnect', () => {
        this.disconnect();
      });

      return true;
    } catch (err: any) {
      console.error('Phantom connection error:', err);
      throw new Error(err?.message || 'Failed to connect Phantom wallet');
    }
  }

  /**
   * Connect to Solflare Wallet
   */
  public async connectSolflare(): Promise<boolean> {
    const anyWin = window as any;
    const provider = anyWin.solflare;

    if (!provider || !provider.isSolflare) {
      window.open('https://solflare.com/', '_blank');
      throw new Error('Solflare Wallet is not installed. Please install the Solflare browser extension.');
    }

    try {
      await provider.connect();
      const pubkey = provider.publicKey.toString();

      let signature: string | undefined;
      try {
        const authMessage = `Sign to authenticate session with CursorClash Trading Protocol.\nAddress: ${pubkey}\nTimestamp: ${Date.now()}`;
        const encoded = new TextEncoder().encode(authMessage);
        const signed = await provider.signMessage(encoded, 'utf8');
        signature = bs58.encode(signed);
      } catch {
        // Continue if user skips message signature
      }

      await this.setupConnectedWallet(pubkey, 'SOLFLARE', 'Solflare Wallet', signature);
      localStorage.setItem(LAST_WALLET_TYPE_KEY, 'SOLFLARE');

      provider.on('accountChanged', (newPubkey: any) => {
        if (newPubkey) {
          this.setupConnectedWallet(newPubkey.toString(), 'SOLFLARE', 'Solflare Wallet');
        } else {
          this.disconnect();
        }
      });

      provider.on('disconnect', () => {
        this.disconnect();
      });

      return true;
    } catch (err: any) {
      console.error('Solflare connection error:', err);
      throw new Error(err?.message || 'Failed to connect Solflare wallet');
    }
  }

  /**
   * Connect to Backpack Wallet
   */
  public async connectBackpack(): Promise<boolean> {
    const anyWin = window as any;
    const provider = anyWin.backpack;

    if (!provider) {
      window.open('https://backpack.app/', '_blank');
      throw new Error('Backpack Wallet is not installed. Please install the Backpack browser extension.');
    }

    try {
      const resp = await provider.connect();
      const pubkey = (resp?.publicKey || provider.publicKey).toString();
      await this.setupConnectedWallet(pubkey, 'BACKPACK', 'Backpack Wallet');
      localStorage.setItem(LAST_WALLET_TYPE_KEY, 'BACKPACK');
      return true;
    } catch (err: any) {
      console.error('Backpack connection error:', err);
      throw new Error(err?.message || 'Failed to connect Backpack wallet');
    }
  }

  /**
   * Instant Devnet Burner Keypair
   */
  public async connectBurnerWallet(): Promise<boolean> {
    let keypair: Keypair;
    const storedSecret = localStorage.getItem(BURNER_STORAGE_KEY);

    if (storedSecret) {
      try {
        const decoded = bs58.decode(storedSecret);
        keypair = Keypair.fromSecretKey(decoded);
      } catch {
        keypair = Keypair.generate();
        localStorage.setItem(BURNER_STORAGE_KEY, bs58.encode(keypair.secretKey));
      }
    } else {
      keypair = Keypair.generate();
      localStorage.setItem(BURNER_STORAGE_KEY, bs58.encode(keypair.secretKey));
    }

    this.burnerKeypair = keypair;
    const pubkey = keypair.publicKey.toBase58();
    await this.setupConnectedWallet(pubkey, 'BURNER', 'Devnet Keypair');
    localStorage.setItem(LAST_WALLET_TYPE_KEY, 'BURNER');

    // Auto-fund burner wallet if balance is low so user can trade right away!
    if (this.currentProfile && this.currentProfile.balanceSol < 0.2) {
      this.requestDevnetAirdrop().catch(() => {});
    }

    return true;
  }

  private async setupConnectedWallet(
    pubkeyStr: string,
    walletType: WalletProfile['walletType'],
    name: string,
    signature?: string
  ) {
    if (this.balanceSubId !== null) {
      try {
        this.connection.removeAccountChangeListener(this.balanceSubId);
      } catch {
        // ignore
      }
      this.balanceSubId = null;
    }

    const { avatar, color } = getDeterminism(pubkeyStr);
    const shortAddress = `${pubkeyStr.slice(0, 4)}...${pubkeyStr.slice(-4)}`;

    this.currentProfile = {
      id: pubkeyStr,
      name,
      address: pubkeyStr,
      shortAddress,
      color,
      avatar,
      balanceSol: 0,
      walletType,
      isConnected: true,
      signature,
    };
    this.notify();

    // Persist or update player profile in Supabase
    supabaseService.upsertProfile({
      wallet_address: pubkeyStr,
      display_name: shortAddress,
      avatar,
    });

    // Fetch real balance from Devnet RPC
    await this.refreshBalance();

    // Listen for live balance mutations on Devnet
    try {
      const pubkey = new PublicKey(pubkeyStr);
      this.balanceSubId = this.connection.onAccountChange(
        pubkey,
        (accountInfo) => {
          const newBal = accountInfo.lamports / LAMPORTS_PER_SOL;
          if (this.currentProfile && this.currentProfile.address === pubkeyStr) {
            this.currentProfile.balanceSol = Number(newBal.toFixed(4));
            this.notify();
          }
        },
        'confirmed'
      );
    } catch (err) {
      console.warn('Could not register account change listener:', err);
    }
  }

  public async refreshBalance(): Promise<number> {
    if (!this.currentProfile || this.isRefreshingBalance) return this.currentProfile?.balanceSol ?? 0;

    this.isRefreshingBalance = true;
    try {
      const pubkey = new PublicKey(this.currentProfile.address);
      const lamports = await this.connection.getBalance(pubkey, 'confirmed');
      const balanceSol = Number((lamports / LAMPORTS_PER_SOL).toFixed(4));

      if (this.currentProfile) {
        this.currentProfile.balanceSol = balanceSol;
        this.notify();
      }
      return balanceSol;
    } catch (err) {
      console.warn('Failed to fetch balance from devnet RPC:', err);
      return this.currentProfile.balanceSol;
    } finally {
      this.isRefreshingBalance = false;
    }
  }

  public async sendAndConfirmTransaction(
    transaction: Transaction,
    onStatus?: (status: string) => void
  ): Promise<string> {
    if (!this.currentProfile || !this.currentProfile.isConnected) {
      throw new Error('Please connect your Solana wallet first');
    }

    onStatus?.('Fetching latest Solana blockhash...');
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;

    const walletType = this.currentProfile.walletType;

    // 1. Instant Devnet Burner Keypair
    if (walletType === 'BURNER') {
      if (!this.burnerKeypair) {
        throw new Error('Burner wallet keypair not found');
      }
      transaction.feePayer = this.burnerKeypair.publicKey;
      onStatus?.('Signing with Devnet Burner keypair...');
      transaction.sign(this.burnerKeypair);

      onStatus?.('Broadcasting to Solana Devnet...');
      const signature = await this.connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      onStatus?.('Confirming on Solana Devnet...');
      await this.connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      await this.refreshBalance();
      return signature;
    }

    const anyWin = window as any;

    // 2. Phantom Wallet Extension
    if (walletType === 'PHANTOM') {
      const provider = anyWin.solana;
      if (!provider?.isPhantom) throw new Error('Phantom wallet extension not detected');
      transaction.feePayer = provider.publicKey;

      onStatus?.('Please approve transaction in Phantom wallet...');
      const { signature } = await provider.signAndSendTransaction(transaction);

      onStatus?.('Confirming on Solana Devnet...');
      await this.connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      await this.refreshBalance();
      return signature;
    }

    // 3. Solflare Wallet Extension
    if (walletType === 'SOLFLARE') {
      const provider = anyWin.solflare;
      if (!provider?.isSolflare) throw new Error('Solflare wallet extension not detected');
      transaction.feePayer = provider.publicKey;

      onStatus?.('Please approve transaction in Solflare wallet...');
      const { signature } = await provider.signAndSendTransaction(transaction);

      onStatus?.('Confirming on Solana Devnet...');
      await this.connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      await this.refreshBalance();
      return signature;
    }

    // 4. Backpack Wallet Extension
    if (walletType === 'BACKPACK') {
      const provider = anyWin.backpack;
      if (!provider) throw new Error('Backpack wallet extension not detected');
      transaction.feePayer = new PublicKey(this.currentProfile.address);

      onStatus?.('Please approve transaction in Backpack wallet...');
      const signed = await provider.signTransaction(transaction);
      const signature = await this.connection.sendRawTransaction(signed.serialize());

      onStatus?.('Confirming on Solana Devnet...');
      await this.connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      await this.refreshBalance();
      return signature;
    }

    throw new Error(`Unsupported wallet type: ${walletType}`);
  }

  public async requestDevnetAirdrop(): Promise<{ success: boolean; signature?: string; error?: string }> {
    if (!this.currentProfile) {
      return { success: false, error: 'No wallet connected' };
    }

    const address = this.currentProfile.address;

    // 1. Try public Solana Devnet airdrop RPC
    try {
      const pubkey = new PublicKey(address);
      const sig = await this.connection.requestAirdrop(pubkey, 1 * LAMPORTS_PER_SOL);
      const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
      await this.connection.confirmTransaction({
        signature: sig,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      }, 'confirmed');

      await this.refreshBalance();
      return { success: true, signature: sig };
    } catch (publicErr) {
      console.warn('Public airdrop RPC unavailable, falling back to protocol keeper faucet...', publicErr);
    }

    // 2. Guaranteed fallback: Protocol Keeper Faucet endpoint
    try {
      const res = await fetch('/api/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (data.success) {
        await this.refreshBalance();
        return { success: true, signature: data.signature };
      }
      throw new Error(data.error || 'Keeper faucet transaction failed');
    } catch (err: any) {
      console.error('All airdrop methods failed:', err);
      return {
        success: false,
        error: err?.message || 'Devnet airdrop rate limit reached. Try web faucet at solfaucet.com',
      };
    }
  }

  public disconnect() {
    if (this.balanceSubId !== null) {
      try {
        this.connection.removeAccountChangeListener(this.balanceSubId);
      } catch {
        // ignore
      }
      this.balanceSubId = null;
    }

    const anyWin = window as any;
    if (this.currentProfile?.walletType === 'PHANTOM' && anyWin.solana?.disconnect) {
      anyWin.solana.disconnect().catch(() => {});
    } else if (this.currentProfile?.walletType === 'SOLFLARE' && anyWin.solflare?.disconnect) {
      anyWin.solflare.disconnect().catch(() => {});
    }

    this.currentProfile = null;
    this.burnerKeypair = null;
    localStorage.removeItem(LAST_WALLET_TYPE_KEY);
    this.notify();
  }

  public getBurnerKeypair(): Keypair | null {
    return this.burnerKeypair;
  }
}

export const solanaWalletService = new SolanaWalletService();
