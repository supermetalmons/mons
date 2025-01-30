import { BaseMessageSignerWalletAdapter } from "@solana/wallet-adapter-base";
import { signIn } from "./connection";

declare global {
  interface Window {
    solana?: BaseMessageSignerWalletAdapter;
  }
}

let walletAdapter: BaseMessageSignerWalletAdapter | null = null;

export async function connectToSolana(): Promise<string> {
  try {
    if (!window.solana) {
      throw new Error("not found");
    }

    if (!walletAdapter) {
      walletAdapter = window.solana;
    }

    if (!walletAdapter.connected) {
      await walletAdapter.connect();
    }

    const publicKey = walletAdapter.publicKey;
    if (!publicKey) {
      throw new Error("not connected");
    }

    const nonce = await signIn();
    if (!nonce) throw new Error("Failed to get nonce");

    const message = `Sign in mons.link with Solana nonce ${nonce}`;
    const encodedMessage = new TextEncoder().encode(message);
    const signature = await walletAdapter.signMessage(encodedMessage);

    return publicKey.toString();
  } catch (error) {
    console.error("Solana connection error:", error);
    throw error;
  }
}
