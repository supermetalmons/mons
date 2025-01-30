import { BaseMessageSignerWalletAdapter } from "@solana/wallet-adapter-base";

declare global {
  interface Window {
    solana?: BaseMessageSignerWalletAdapter;
  }
}

const SIGN_IN_MESSAGE = "Sign this message to verify your Solana wallet ownership";

let walletAdapter: BaseMessageSignerWalletAdapter | null = null;

export async function connectToSolana(): Promise<string> {
  try {
    if (!window.solana) {
      throw new Error("No Solana wallet found. Please install a Solana wallet extension.");
    }

    if (!walletAdapter) {
      walletAdapter = window.solana;
    }

    if (!walletAdapter.connected) {
      await walletAdapter.connect();
    }

    const publicKey = walletAdapter.publicKey;
    if (!publicKey) {
      throw new Error("Wallet not connected");
    }

    const message = new TextEncoder().encode(SIGN_IN_MESSAGE);
    const signature = await walletAdapter.signMessage(message);
    console.log(signature);

    return publicKey.toString();
  } catch (error) {
    console.error("Solana connection error:", error);
    throw error;
  }
}
