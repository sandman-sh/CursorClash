export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface MarketStats {
  price: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  change24h: number;
}

type PriceListener = (price: number, stats: MarketStats) => void;
type CandleListener = (candles: Candle[]) => void;

class PriceFeedService {
  private currentPrice: number = 142.85;
  private marketStats: MarketStats = {
    price: 142.85,
    high24h: 146.4,
    low24h: 138.9,
    volume24h: 342.8,
    change24h: 2.85,
  };
  private candles: Candle[] = [];
  private priceListeners: Set<PriceListener> = new Set();
  private candleListeners: Set<CandleListener> = new Set();
  private ws: WebSocket | null = null;
  private reconnectTimeout: any = null;
  private isDestroyed: boolean = false;

  constructor() {
    this.fetchInitialCandles();
    this.connectWebSocket();
  }

  public getCurrentPrice(): number {
    return this.currentPrice;
  }

  public getMarketStats(): MarketStats {
    return { ...this.marketStats };
  }

  public getCandles(): Candle[] {
    return [...this.candles];
  }

  public subscribePrice(cb: PriceListener): () => void {
    this.priceListeners.add(cb);
    cb(this.currentPrice, this.marketStats);
    return () => this.priceListeners.delete(cb);
  }

  public subscribeCandles(cb: CandleListener): () => void {
    this.candleListeners.add(cb);
    if (this.candles.length > 0) {
      cb([...this.candles]);
    }
    return () => this.candleListeners.delete(cb);
  }

  /**
   * Fetch real historical 1m SOL/USDT candlesticks from Binance REST API
   */
  private async fetchInitialCandles() {
    try {
      const resp = await fetch('https://api.binance.com/api/v3/klines?symbol=SOLUSDT&interval=1m&limit=40');
      if (resp.ok) {
        const raw = await resp.json();
        const parsed: Candle[] = raw.map((k: any) => ({
          timestamp: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }));

        if (parsed.length > 0) {
          this.candles = parsed;
          const latest = parsed[parsed.length - 1];
          this.currentPrice = latest.close;
          this.marketStats.price = latest.close;
          this.notifyCandles();
          this.notifyPrice();
        }
      }
    } catch (err) {
      console.warn('Could not fetch initial candles from Binance REST:', err);
      // Fallback baseline candles if network blocks Binance REST
      this.generateFallbackCandles();
    }
  }

  /**
   * Connect to Binance Public High-Frequency WebSocket for SOL/USDT
   */
  private connectWebSocket() {
    if (this.isDestroyed) return;

    try {
      // Subscribe to combined stream: 24h ticker + 1s kline
      const streamUrl = 'wss://stream.binance.com:9443/stream?streams=solusdt@ticker/solusdt@kline_1s';
      this.ws = new WebSocket(streamUrl);

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const stream = message.stream;
          const data = message.data;

          if (stream === 'solusdt@ticker') {
            const price = parseFloat(data.c);
            const high = parseFloat(data.h);
            const low = parseFloat(data.l);
            const vol = parseFloat(data.v);
            const change = parseFloat(data.P);

            this.currentPrice = price;
            this.marketStats = {
              price,
              high24h: high,
              low24h: low,
              volume24h: Number(vol.toFixed(1)),
              change24h: change,
            };

            this.notifyPrice();
          } else if (stream === 'solusdt@kline_1s') {
            const k = data.k;
            const currentClose = parseFloat(k.c);
            const currentHigh = parseFloat(k.h);
            const currentLow = parseFloat(k.l);
            const currentOpen = parseFloat(k.o);
            const candleTime = k.t;

            this.updateLiveCandle({
              timestamp: candleTime,
              open: currentOpen,
              high: currentHigh,
              low: currentLow,
              close: currentClose,
            });
          }
        } catch (e) {
          // ignore parsing error
        }
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };

      this.ws.onclose = () => {
        if (!this.isDestroyed) {
          this.reconnectTimeout = setTimeout(() => this.connectWebSocket(), 3000);
        }
      };
    } catch (err) {
      console.warn('WebSocket connection error:', err);
      if (!this.isDestroyed) {
        this.reconnectTimeout = setTimeout(() => this.connectWebSocket(), 5000);
      }
    }
  }

  private updateLiveCandle(candle: Candle) {
    if (this.candles.length === 0) {
      this.candles.push(candle);
      this.notifyCandles();
      return;
    }

    const last = this.candles[this.candles.length - 1];
    // Group into 5-second interval candles for optimal chart visualization
    const intervalMs = 5000;
    const isSameInterval = Math.floor(candle.timestamp / intervalMs) === Math.floor(last.timestamp / intervalMs);

    if (isSameInterval) {
      last.close = candle.close;
      last.high = Math.max(last.high, candle.close);
      last.low = Math.min(last.low, candle.close);
    } else {
      const nextCandle: Candle = {
        timestamp: candle.timestamp,
        open: last.close,
        high: Math.max(last.close, candle.close),
        low: Math.min(last.close, candle.close),
        close: candle.close,
      };
      this.candles.push(nextCandle);
      if (this.candles.length > 50) {
        this.candles.shift();
      }
    }

    this.notifyCandles();
  }

  private generateFallbackCandles() {
    const base = 142.5;
    const now = Date.now();
    const result: Candle[] = [];
    let p = base;
    for (let i = 35; i >= 0; i--) {
      const open = p;
      const c = open + (Math.random() - 0.49) * 0.3;
      result.push({
        timestamp: now - i * 5000,
        open,
        high: Math.max(open, c) + Math.random() * 0.15,
        low: Math.min(open, c) - Math.random() * 0.15,
        close: c,
      });
      p = c;
    }
    this.candles = result;
    this.currentPrice = p;
    this.notifyCandles();
    this.notifyPrice();
  }

  private notifyPrice() {
    this.priceListeners.forEach((cb) => cb(this.currentPrice, this.marketStats));
  }

  private notifyCandles() {
    const copy = [...this.candles];
    this.candleListeners.forEach((cb) => cb(copy));
  }

  public destroy() {
    this.isDestroyed = true;
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
    this.priceListeners.clear();
    this.candleListeners.clear();
  }
}

export const priceFeedService = new PriceFeedService();
