/**
 * Kora Client Library
 * TypeScript client for communicating with Kora server for gasless transactions
 */

// Services
export { getKoraService, KoraService, resetKoraService } from './services/koraService';
export { getGaslessService, GaslessService, resetGaslessService } from './services/gaslessService';

// Types
export type { FeeEstimate, KoraStatus, PaymentInstruction } from './services/koraService';
export type { GaslessTransferParams, GaslessTransactionResult } from './services/gaslessService';

// Configuration
import KoraConfig from '../config/kora.config.json';

export { KoraConfig };