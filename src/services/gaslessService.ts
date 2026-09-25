/**
 * Gasless Transaction Service
 * Handles gasless transactions using Kora server
 */

import { Connection, Transaction, PublicKey, SystemProgram } from '@solana/web3.js';
import { getKoraService, FeeEstimate } from './koraService';
import { createTransferInstruction, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from '@solana/spl-token';

export interface GaslessTransferParams {
  connection: Connection;
  senderPublicKey: string;
  recipientAddress: string;
  amount: number;
  tokenMint: string;
  tokenDecimals: number;
  senderSigner: any; // Privy provider or keypair
}

export interface GaslessTransactionResult {
  success: boolean;
  signature?: string;
  feeEstimate?: FeeEstimate;
  error?: string;
}

export class GaslessService {
  private koraService = getKoraService();

  /**
   * Process complete gasless transfer
   */
  async processGaslessTransfer(params: GaslessTransferParams): Promise<GaslessTransactionResult> {
    try {
      // Step 1: Build transaction
      const transaction = await this.buildTransaction(
        params.connection,
        params.senderPublicKey,
        params.recipientAddress,
        params.amount,
        params.tokenMint,
        params.tokenDecimals
      );

      // Step 2: Estimate fee via Kora
      const feeEstimate = await this.koraService.estimateFee(transaction);

      // Step 3: Add payment instruction
      const paymentInstruction = await this.koraService.getPaymentInstruction(
        feeEstimate.tokenAmount
      );
      transaction.add(paymentInstruction.instruction);

      // Step 4: Sign with user's key
      const userSignedTx = await this.signWithUser(transaction, params.senderSigner);

      // Step 5: Submit to Kora for co-signing and broadcasting
      const signature = await this.koraService.signAndSendTransaction(
        userSignedTx,
        params.senderPublicKey
      );

      return {
        success: true,
        signature,
        feeEstimate
      };
    } catch (error) {
      console.error('Gasless transfer failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Transaction failed'
      };
    }
  }

  /**
   * Build transfer transaction
   */
  private async buildTransaction(
    connection: Connection,
    senderPublicKey: string,
    recipientAddress: string,
    amount: number,
    tokenMint: string,
    tokenDecimals: number
  ): Promise<Transaction> {
    const senderPubkey = new PublicKey(senderPublicKey);
    const recipientPubkey = new PublicKey(recipientAddress);
    const mintPubkey = new PublicKey(tokenMint);

    const transaction = new Transaction();

    // Get recent blockhash from Kora
    const blockhash = await this.koraService.getBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = senderPubkey;

    if (tokenMint === 'So11111111111111111111111111111111111111112') {
      // SOL transfer
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: senderPubkey,
          toPubkey: recipientPubkey,
          lamports: Math.floor(amount * 1e9)
        })
      );
    } else {
      // SPL token transfer
      const fromTokenAccount = await getAssociatedTokenAddress(mintPubkey, senderPubkey);
      const toTokenAccount = await getAssociatedTokenAddress(mintPubkey, recipientPubkey);

      // Check if recipient's token account exists
      const toTokenAccountInfo = await connection.getAccountInfo(toTokenAccount);
      
      if (!toTokenAccountInfo) {
        // Create associated token account for recipient
        transaction.add(
          createAssociatedTokenAccountInstruction(
            senderPubkey,
            toTokenAccount,
            recipientPubkey,
            mintPubkey
          )
        );
      }

      // Add transfer instruction
      const amountInSmallestUnit = Math.floor(amount * Math.pow(10, tokenDecimals));
      transaction.add(
        createTransferInstruction(
          fromTokenAccount,
          toTokenAccount,
          senderPubkey,
          amountInSmallestUnit
        )
      );
    }

    return transaction;
  }

  /**
   * Sign transaction with user's key
   */
  private async signWithUser(transaction: Transaction, signer: any): Promise<Transaction> {
    // This will need to be adapted based on the actual signer interface
    // For now, assuming a standard signTransaction method
    if (typeof signer.signTransaction === 'function') {
      return await signer.signTransaction(transaction);
    } else if (typeof signer.request === 'function') {
      // Privy-style interface
      const result = await signer.request({
        method: 'signTransaction',
        params: { transaction }
      });
      return result.transaction || result;
    } else {
      throw new Error('Unsupported signer interface');
    }
  }

  /**
   * Estimate fee without executing transaction
   */
  async estimateTransferFee(params: GaslessTransferParams): Promise<{
    feeEstimate: FeeEstimate;
  }> {
    try {
      // Build transaction
      const transaction = await this.buildTransaction(
        params.connection,
        params.senderPublicKey,
        params.recipientAddress,
        params.amount,
        params.tokenMint,
        params.tokenDecimals
      );

      // Estimate fee
      const feeEstimate = await this.koraService.estimateFee(transaction);

      return {
        feeEstimate
      };
    } catch (error) {
      console.error('Fee estimation failed:', error);
      throw error;
    }
  }

  /**
   * Validate transfer parameters
   */
  validateTransferParams(params: GaslessTransferParams): { valid: boolean; error?: string } {
    if (!params.senderPublicKey) {
      return { valid: false, error: 'Sender public key is required' };
    }

    if (!params.recipientAddress) {
      return { valid: false, error: 'Recipient address is required' };
    }

    if (params.amount <= 0) {
      return { valid: false, error: 'Amount must be greater than 0' };
    }

    if (!params.tokenMint) {
      return { valid: false, error: 'Token mint is required' };
    }

    // Validate recipient address format
    try {
      new PublicKey(params.recipientAddress);
    } catch {
      return { valid: false, error: 'Invalid recipient address' };
    }

    return { valid: true };
  }
}

// Singleton instance
let gaslessServiceInstance: GaslessService | null = null;

export function getGaslessService(): GaslessService {
  if (!gaslessServiceInstance) {
    gaslessServiceInstance = new GaslessService();
  }
  return gaslessServiceInstance;
}

export function resetGaslessService(): void {
  gaslessServiceInstance = null;
}