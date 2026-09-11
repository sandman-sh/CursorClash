import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import WebSocket from 'ws'
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js'

const KEEPER_SECRET_KEY = [
  148, 58, 44, 232, 163, 34, 110, 179, 120, 82, 187, 163, 78, 202, 131, 187,
  12, 11, 228, 90, 142, 215, 148, 137, 5, 114, 48, 44, 255, 60, 110, 190,
  38, 109, 29, 7, 195, 149, 147, 4, 151, 243, 170, 87, 200, 209, 202, 157,
  86, 144, 126, 10, 36, 69, 148, 165, 140, 142, 145, 175, 21, 154, 43, 87,
]

const PROGRAM_ID = new PublicKey('AvmjRWFevdy6WK7D2towMreTFtMKijCGEKMSK7j9rgSP')
const DISC_RESOLVE_FLAG = Buffer.from([0x78, 0x79, 0xae, 0xc3, 0x93, 0xa3, 0xbd, 0x2c])

function multiplayerRelayPlugin(): Plugin {
  return {
    name: 'multiplayer-relay',
    configureServer(server) {
      // 1. API Endpoints for Faucet & On-Chain Settlement Payouts
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/api/faucet' && req.method === 'POST') {
          let bodyStr = ''
          req.on('data', (chunk) => { bodyStr += chunk })
          req.on('end', async () => {
            try {
              const { address } = JSON.parse(bodyStr)
              if (!address) {
                res.statusCode = 400
                return res.end(JSON.stringify({ error: 'Missing recipient address' }))
              }
              const conn = new Connection('https://api.devnet.solana.com', 'confirmed')
              const keeper = Keypair.fromSecretKey(Uint8Array.from(KEEPER_SECRET_KEY))
              const recipient = new PublicKey(address)

              const tx = new Transaction().add(
                SystemProgram.transfer({
                  fromPubkey: keeper.publicKey,
                  toPubkey: recipient,
                  lamports: 0.5 * LAMPORTS_PER_SOL,
                })
              )
              const bh = await conn.getLatestBlockhash('confirmed')
              tx.recentBlockhash = bh.blockhash
              tx.feePayer = keeper.publicKey
              tx.sign(keeper)

              const sig = await conn.sendRawTransaction(tx.serialize())
              await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed')
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true, signature: sig, amountSol: 0.5 }))
            } catch (err: any) {
              console.error('API /api/faucet error:', err)
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: false, error: err.message }))
            }
          })
          return
        }

        if (req.url === '/api/resolve' && req.method === 'POST') {
          let bodyStr = ''
          req.on('data', (chunk) => { bodyStr += chunk })
          req.on('end', async () => {
            try {
              const { roomId, playerAddress, isWin, settlementPrice, payoutAmountLamports } = JSON.parse(bodyStr)
              const conn = new Connection('https://api.devnet.solana.com', 'confirmed')
              const keeper = Keypair.fromSecretKey(Uint8Array.from(KEEPER_SECRET_KEY))
              const playerPubkey = new PublicKey(playerAddress)

              const [arenaPda] = PublicKey.findProgramAddressSync(
                [Buffer.from('arena'), Buffer.from(roomId || 'trench-1')],
                PROGRAM_ID
              )
              const [playerStatePda] = PublicKey.findProgramAddressSync(
                [Buffer.from('player'), arenaPda.toBuffer(), playerPubkey.toBuffer()],
                PROGRAM_ID
              )

              const tx = new Transaction()

              // Check if player state PDA exists on-chain before invoking contract
              const playerStateInfo = await conn.getAccountInfo(playerStatePda)
              if (playerStateInfo) {
                const argsBuf = Buffer.alloc(8 + 1 + 8)
                argsBuf.writeBigUInt64LE(BigInt(Math.max(1, Math.round((settlementPrice || 178) * 100))), 0)
                argsBuf.writeUInt8(isWin ? 1 : 0, 8)
                argsBuf.writeBigUInt64LE(BigInt(Math.max(0, payoutAmountLamports || 0)), 9)

                tx.add(
                  new TransactionInstruction({
                    programId: PROGRAM_ID,
                    keys: [
                      { pubkey: arenaPda, isSigner: false, isWritable: true },
                      { pubkey: playerStatePda, isSigner: false, isWritable: true },
                    ],
                    data: Buffer.concat([DISC_RESOLVE_FLAG, argsBuf]),
                  })
                )
              }

              // If win, keeper sends real Devnet SOL payout to player!
              if (isWin && payoutAmountLamports > 0) {
                tx.add(
                  SystemProgram.transfer({
                    fromPubkey: keeper.publicKey,
                    toPubkey: playerPubkey,
                    lamports: payoutAmountLamports,
                  })
                )
              }

              if (tx.instructions.length > 0) {
                const bh = await conn.getLatestBlockhash('confirmed')
                tx.recentBlockhash = bh.blockhash
                tx.feePayer = keeper.publicKey
                tx.sign(keeper)

                const sig = await conn.sendRawTransaction(tx.serialize())
                await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed')
                res.setHeader('Content-Type', 'application/json')
                return res.end(JSON.stringify({ success: true, signature: sig }))
              }

              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true, signature: null }))
            } catch (err: any) {
              console.error('API /api/resolve error:', err)
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: false, error: err.message }))
            }
          })
          return
        }

        next()
      })

      // 2. WebSocket Relay for Cross-Browser Cursor & Event Mesh
      if (!server.httpServer) return
      const ServerConstructor = (WebSocket as any).Server || (WebSocket as any).WebSocketServer
      if (!ServerConstructor) return

      const wss = new ServerConstructor({ noServer: true })

      server.httpServer.on('upgrade', (req, socket, head) => {
        if (req.url && req.url.startsWith('/multiplayer')) {
          wss.handleUpgrade(req, socket, head, (ws: any) => {
            wss.emit('connection', ws, req)
          })
        }
      })

      wss.on('connection', (ws: any) => {
        ws.on('message', (message: any) => {
          const textMsg = message.toString()
          wss.clients.forEach((client: any) => {
            if (client !== ws && client.readyState === 1) { // 1 = OPEN
              client.send(textMsg)
            }
          })
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), multiplayerRelayPlugin()],
  define: {
    'process.env': {},
    global: 'globalThis',
  },
})

