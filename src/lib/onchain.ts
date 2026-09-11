import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';

export const CURSORCLASH_PROGRAM_ID = new PublicKey('AvmjRWFevdy6WK7D2towMreTFtMKijCGEKMSK7j9rgSP');

// Anchor 8-byte Instruction Discriminators (sha256("global:<name>")[0..8])
const DISC_INITIALIZE_ARENA = new Uint8Array([0x0b, 0x25, 0xdd, 0x01, 0xcd, 0x78, 0x19, 0xe6]);
const DISC_PLACE_TAP_FLAG = new Uint8Array([0x12, 0x34, 0x19, 0x30, 0x8b, 0xc3, 0xcb, 0xee]);
const DISC_COPY_TRADE_FLAG = new Uint8Array([0x8f, 0xa2, 0x88, 0x2c, 0x99, 0x6a, 0xcb, 0x45]);
const DISC_RESOLVE_FLAG = new Uint8Array([0x78, 0x79, 0xae, 0xc3, 0x93, 0xa3, 0xbd, 0x2c]);

const encoder = new TextEncoder();

export function concatArrays(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((acc, curr) => acc + curr.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    out.set(arr, offset);
    offset += arr.length;
  }
  return out;
}

export function getArenaPda(roomId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [encoder.encode('arena'), encoder.encode(roomId)],
    CURSORCLASH_PROGRAM_ID
  );
}

export function getPlayerStatePda(arenaPda: PublicKey, playerPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [encoder.encode('player'), arenaPda.toBytes(), playerPubkey.toBytes()],
    CURSORCLASH_PROGRAM_ID
  );
}

export function buildInitializeArenaInstruction(
  roomId: string,
  authorityPubkey: PublicKey,
  baseAsset: string = 'SOL/USD',
  initialPriceCents: number = 17800
): TransactionInstruction {
  const [arenaPda] = getArenaPda(roomId);

  const roomBytes = encoder.encode(roomId);
  const roomLen = new Uint8Array(4);
  new DataView(roomLen.buffer).setUint32(0, roomBytes.length, true);

  const assetBytes = encoder.encode(baseAsset);
  const assetLen = new Uint8Array(4);
  new DataView(assetLen.buffer).setUint32(0, assetBytes.length, true);

  const priceBytes = new Uint8Array(8);
  new DataView(priceBytes.buffer).setBigUint64(0, BigInt(initialPriceCents), true);

  const data = concatArrays(DISC_INITIALIZE_ARENA, roomLen, roomBytes, assetLen, assetBytes, priceBytes);

  return new TransactionInstruction({
    programId: CURSORCLASH_PROGRAM_ID,
    keys: [
      { pubkey: arenaPda, isSigner: false, isWritable: true },
      { pubkey: authorityPubkey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: data as unknown as Buffer,
  });
}

export function buildPlaceTapFlagInstruction(params: {
  playerPubkey: PublicKey;
  roomId: string;
  flagType: 'LONG' | 'SHORT';
  targetPrice: number;
  stakeSol: number;
  leverage: number;
}): { instruction: TransactionInstruction; transferIx: TransactionInstruction; arenaPda: PublicKey } {
  const [arenaPda] = getArenaPda(params.roomId);
  const [playerStatePda] = getPlayerStatePda(arenaPda, params.playerPubkey);

  const args = new Uint8Array(1 + 8 + 8 + 1);
  const view = new DataView(args.buffer);

  // flag_type (u8): 0 = Long, 1 = Short
  view.setUint8(0, params.flagType === 'LONG' ? 0 : 1);

  // target_price (u64): cents
  const priceCents = BigInt(Math.max(1, Math.round(params.targetPrice * 100)));
  view.setBigUint64(1, priceCents, true);

  // stake_amount (u64): lamports
  const stakeLamports = BigInt(Math.max(1, Math.round(params.stakeSol * LAMPORTS_PER_SOL)));
  view.setBigUint64(9, stakeLamports, true);

  // leverage (u8)
  view.setUint8(17, Math.min(255, Math.max(1, params.leverage)));

  const data = concatArrays(DISC_PLACE_TAP_FLAG, args);

  const instruction = new TransactionInstruction({
    programId: CURSORCLASH_PROGRAM_ID,
    keys: [
      { pubkey: arenaPda, isSigner: false, isWritable: true },
      { pubkey: playerStatePda, isSigner: false, isWritable: true },
      { pubkey: params.playerPubkey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: data as unknown as Buffer,
  });

  // Transfer the real stake in Devnet SOL to the on-chain arena account
  const transferIx = SystemProgram.transfer({
    fromPubkey: params.playerPubkey,
    toPubkey: arenaPda,
    lamports: Number(stakeLamports),
  });

  return { instruction, transferIx, arenaPda };
}

export function buildCopyTradeInstruction(params: {
  followerPubkey: PublicKey;
  targetPlayerPubkey: PublicKey;
  roomId: string;
  stakeSol: number;
}): { instruction: TransactionInstruction; transferIx: TransactionInstruction; arenaPda: PublicKey } {
  const [arenaPda] = getArenaPda(params.roomId);
  const [targetStatePda] = getPlayerStatePda(arenaPda, params.targetPlayerPubkey);
  const [followerStatePda] = getPlayerStatePda(arenaPda, params.followerPubkey);

  const stakeLamports = BigInt(Math.max(1, Math.round(params.stakeSol * LAMPORTS_PER_SOL)));
  const args = new Uint8Array(32 + 8);
  args.set(params.targetPlayerPubkey.toBytes(), 0);
  new DataView(args.buffer).setBigUint64(32, stakeLamports, true);

  const data = concatArrays(DISC_COPY_TRADE_FLAG, args);

  const instruction = new TransactionInstruction({
    programId: CURSORCLASH_PROGRAM_ID,
    keys: [
      { pubkey: arenaPda, isSigner: false, isWritable: true },
      { pubkey: targetStatePda, isSigner: false, isWritable: true },
      { pubkey: followerStatePda, isSigner: false, isWritable: true },
      { pubkey: params.followerPubkey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: data as unknown as Buffer,
  });

  const transferIx = SystemProgram.transfer({
    fromPubkey: params.followerPubkey,
    toPubkey: arenaPda,
    lamports: Number(stakeLamports),
  });

  return { instruction, transferIx, arenaPda };
}

export function buildResolveFlagInstruction(params: {
  roomId: string;
  playerPubkey: PublicKey;
  settlementPrice: number;
  isWin: boolean;
  payoutSol: number;
}): TransactionInstruction {
  const [arenaPda] = getArenaPda(params.roomId);
  const [playerStatePda] = getPlayerStatePda(arenaPda, params.playerPubkey);

  const args = new Uint8Array(8 + 1 + 8);
  const view = new DataView(args.buffer);
  const priceCents = BigInt(Math.max(1, Math.round(params.settlementPrice * 100)));
  view.setBigUint64(0, priceCents, true);
  view.setUint8(8, params.isWin ? 1 : 0);
  const payoutLamports = BigInt(Math.max(0, Math.round(params.payoutSol * LAMPORTS_PER_SOL)));
  view.setBigUint64(9, payoutLamports, true);

  const data = concatArrays(DISC_RESOLVE_FLAG, args);

  return new TransactionInstruction({
    programId: CURSORCLASH_PROGRAM_ID,
    keys: [
      { pubkey: arenaPda, isSigner: false, isWritable: true },
      { pubkey: playerStatePda, isSigner: false, isWritable: true },
    ],
    data: data as unknown as Buffer,
  });
}
