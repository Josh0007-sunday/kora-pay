/**
 * Kora Service Integration
 * Handles communication with Kora RPC server for gasless transactions
 */

import { Connection, Transaction, PublicKey } from '@solana/web3.js';
import KoraConfig from '../../config/kora.config.json';

export interface FeeEstimate {
  lamports: number;        // SOL fee in lamports
  tokenAmount: number;     // USDC fee amount
  price: number;          // USDC/SOL exchange rate
  totalCostUSD: number;   // Total cost in USD
}

export interface KoraStatus {
  healthy: boolean;
  version: string;
  supportedTokens: string[];
  uptime: number;
}

export interface PaymentInstruction {
  instruction: any;
  destination: string;
  amount: number;
}

export class KoraService {
  private rpcUrl: string;
  private fallbackRpcUrls: string[];
  private solanaRpcUrl: string;
  private config: typeof KoraConfig;
  private currentRpcIndex: number = 0;

  constructor(config: typeof KoraConfig) {
    this.rpcUrl = config.rpcUrl;
    this.fallbackRpcUrls = config.fallbackRpcUrls || [];
    this.solanaRpcUrl = config.solanaRpcUrl;
    this.config = config;
  }

  /**
   * Initialize Kora service and check server health
   */
  async initialize(): Promise<void> {
    try {
      const status = await this.getStatus();
      if (!status.healthy) {
        throw new Error('Kora server is not healthy');
      }
      console.log('Kora service initialized successfully', status);
    } catch (error) {
      console.error('Failed to initialize Kora service:', error);
      throw error;
    }
  }

  /**
   * Get current Kora server status
   */
  async getStatus(): Promise<KoraStatus> {
    try {
      const response = await this.makeRpcCall('getConfig', {});
      return {
        healthy: true,
        version: response.version || 'unknown',
        supportedTokens: response.validation?.allowed_tokens || [],
        uptime: response.uptime || 0
      };
    } catch (error) {
      console.error('Failed to get Kora status:', error);
      return {
        healthy: false,
        version: 'unknown',
        supportedTokens: [],
        uptime: 0
      };
    }
  }

  /**
   * Estimate transaction fee in USDC
   */
  async estimateFee(transaction: Transaction): Promise<FeeEstimate> {
    try {
      const response = await this.makeRpcCall('estimateTransactionFee', {
        transaction: this.serializeTransaction(transaction),
        feeToken: this.config.feeToken.mint
      });

      return {
        lamports: response.lamports || 0,
        tokenAmount: response.tokenAmount || 0,
        price: response.price || 0,
        totalCostUSD: response.totalCostUSD || 0
      };
    } catch (error) {
      console.error('Failed to estimate fee:', error);
      throw new Error('Fee estimation failed');
    }
  }

  /**
   * Get payment instruction for USDC fee
   */
  async getPaymentInstruction(feeAmount: number): Promise<PaymentInstruction> {
    try {
      const response = await this.makeRpcCall('getPaymentInstruction', {
        amount: feeAmount,
        token: this.config.feeToken.mint
      });

      return {
        instruction: response.instruction,
        destination: response.destination,
        amount: response.amount
      };
    } catch (error) {
      console.error('Failed to get payment instruction:', error);
      throw new Error('Payment instruction generation failed');
    }
  }

  /**
   * Sign and send transaction via Kora
   */
  async signAndSendTransaction(
    transaction: Transaction,
    userSignature: string
  ): Promise<string> {
    try {
      const response = await this.makeRpcCall('signAndSendTransaction', {
        transaction: this.serializeTransaction(transaction),
        userSignature: userSignature
      });

      return response.signature || response;
    } catch (error) {
      console.error('Failed to sign and send transaction:', error);
      throw new Error('Transaction signing and sending failed');
    }
  }

  /**
   * Get latest blockhash from Kora
   */
  async getBlockhash(): Promise<string> {
    try {
      const response = await this.makeRpcCall('getBlockhash', {});
      return response.blockhash;
    } catch (error) {
      console.error('Failed to get blockhash:', error);
      throw new Error('Blockhash retrieval failed');
    }
  }

  /**
   * Get supported tokens for fee payment
   */
  async getSupportedTokens(): Promise<string[]> {
    try {
      const response = await this.makeRpcCall('getSupportedTokens', {});
      return response.tokens || [];
    } catch (error) {
      console.error('Failed to get supported tokens:', error);
      return [];
    }
  }

  /**
   * Make RPC call to Kora server with fallback support
   */
  private async makeRpcCall(method: string, params: any): Promise<any> {
    const maxRetries = this.config.retryAttempts;
    let lastError: Error = new Error('Unknown error');

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const rpcUrl = this.getCurrentRpcUrl();
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.config.authentication.apiKey && {
              'Authorization': `Bearer ${this.config.authentication.apiKey}`
            })
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method,
            params
          }),
          signal: AbortSignal.timeout(this.config.timeout)
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.error) {
          throw new Error(data.error.message || 'RPC error');
        }

        return data.result;
      } catch (error) {
        lastError = error as Error;
        console.error(`RPC call failed (attempt ${attempt + 1}/${maxRetries + 1}):`, error);

        // Try next RPC URL if available
        if (this.currentRpcIndex < this.fallbackRpcUrls.length) {
          this.currentRpcIndex++;
          continue;
        }

        // Wait before retry if not last attempt
        if (attempt < maxRetries) {
          await this.delay(1000 * (attempt + 1));
        }
      }
    }

    throw lastError;
  }

  /**
   * Get current RPC URL (with fallback logic)
   */
  private getCurrentRpcUrl(): string {
    if (this.currentRpcIndex === 0) {
      return this.rpcUrl;
    }
    return this.fallbackRpcUrls[this.currentRpcIndex - 1] || this.rpcUrl;
  }

  /**
   * Serialize transaction for RPC transmission
   */
  private serializeTransaction(transaction: Transaction): string {
    return transaction.serialize().toString('base64');
  }

  /**
   * Delay helper for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reset RPC URL index (call after successful operation)
   */
  private resetRpcIndex(): void {
    this.currentRpcIndex = 0;
  }
}

// Singleton instance
let koraServiceInstance: KoraService | null = null;

export function getKoraService(): KoraService {
  if (!koraServiceInstance) {
    koraServiceInstance = new KoraService(KoraConfig as any);
  }
  return koraServiceInstance;
}

export function resetKoraService(): void {
  koraServiceInstance = null;
}