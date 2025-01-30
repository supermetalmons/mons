import { BaseMessageSignerWalletAdapter } from "@solana/wallet-adapter-base";

const SIGN_IN_MESSAGE = "Sign this message to verify your Solana wallet ownership";
// TODO: use a message similar to sign in with eth

let walletAdapter: BaseMessageSignerWalletAdapter | null = null;

export async function connectToSolana(): Promise<string> {
  try {
    const { PhantomWalletAdapter } = await import("@solana/wallet-adapter-phantom");
    // TODO: make it work with a generic solana wallet

    if (!walletAdapter) {
      walletAdapter = new PhantomWalletAdapter();
    }

    await walletAdapter.connect();
    const publicKey = walletAdapter.publicKey;

    if (!publicKey) {
      throw new Error("No public key found");
    }

    const message = new TextEncoder().encode(SIGN_IN_MESSAGE);
    const signature = await walletAdapter.signMessage(message);
    console.log(signature);
    // TODO: verify signature with a cloud function

    return publicKey.toString();
  } catch (error) {
    console.error("Solana connection error:", error);
    throw error;
  }
}

export async function disconnectSolana(): Promise<void> {
  if (walletAdapter?.connected) {
    await walletAdapter.disconnect();
  }
}
