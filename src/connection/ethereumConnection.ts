import { BrowserProvider } from "ethers";
import { SiweMessage } from "siwe";
import { connection } from "./connection";

declare global {
  interface Window {
    ethereum?: any;
  }
}

export async function connectToEthereumAndSign(): Promise<{ message: string; signature: string; intentId: string; address: string }> {
  if (!window.ethereum) {
    throw new Error("not found");
  }

  const provider = new BrowserProvider(window.ethereum as any);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);

  const intent = await connection.beginAuthIntent("eth");
  if (!intent || !intent.nonce || !intent.intentId) {
    throw new Error("Failed to begin Ethereum auth intent");
  }

  const message = new SiweMessage({
    domain: window.location.host,
    address,
    statement: "mons ftw",
    uri: window.location.origin,
    version: "1",
    chainId,
    nonce: intent.nonce,
  }).prepareMessage();

  const signature = await signer.signMessage(message);

  return {
    message,
    signature,
    intentId: intent.intentId,
    address,
  };
}
