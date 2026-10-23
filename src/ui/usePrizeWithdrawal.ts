import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { isValidSolanaAddress } from "@mons/shared/solana";
import type { EventPrizeAssignment } from "../connection/connectionModels";

type PrizeWithdrawalStatus = "idle" | "sending" | "success";

interface UsePrizeWithdrawalOptions {
  prize: EventPrizeAssignment | null;
  claimAvailable: boolean;
  isAuthenticated: boolean;
  initialAddress: string;
  onWithdraw: (prize: EventPrizeAssignment, address: string) => Promise<void>;
  onDismiss: (outsideTap: boolean) => void;
}

const getPrizeWithdrawalErrorMessage = (error: unknown): string => {
  const errorData =
    error && typeof error === "object"
      ? (error as { code?: unknown; message?: unknown })
      : {};
  const code =
    typeof errorData.code === "string"
      ? errorData.code.replace(/^functions\//, "")
      : "";
  const message =
    typeof errorData.message === "string" ? errorData.message : "";
  if (code === "invalid-argument") {
    return message.includes("destination other than")
      ? "Choose a different destination address."
      : "Enter a valid Solana address.";
  }
  if (code === "not-found" || code === "permission-denied") {
    return "This prize is no longer available.";
  }
  if (code === "aborted") {
    return "Withdrawal is already being processed. Try again shortly.";
  }
  if (code === "failed-precondition") {
    return message.includes("original destination")
      ? "Retry with the original destination address."
      : "This prize cannot be withdrawn right now.";
  }
  return "Could not send the prize. Please try again.";
};

export const usePrizeWithdrawal = ({
  prize,
  claimAvailable,
  isAuthenticated,
  initialAddress,
  onWithdraw,
  onDismiss,
}: UsePrizeWithdrawalOptions) => {
  const [address, setAddressValue] = useState(initialAddress);
  const [isAddressVisible, setIsAddressVisible] = useState(false);
  const [status, setStatus] = useState<PrizeWithdrawalStatus>("idle");
  const [error, setError] = useState("");
  const inFlightRef = useRef(false);
  const dismissTimeoutRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const isLocked = status === "sending" || status === "success";

  useLayoutEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (dismissTimeoutRef.current !== null) {
        window.clearTimeout(dismissTimeoutRef.current);
      }
    };
  }, []);

  const setAddress = (value: string) => {
    setAddressValue(value);
    setError("");
  };

  const dismiss = useCallback(
    (outsideTap = false) => {
      if (!isMountedRef.current || isLocked || inFlightRef.current) {
        return;
      }
      if (dismissTimeoutRef.current !== null) {
        window.clearTimeout(dismissTimeoutRef.current);
        dismissTimeoutRef.current = null;
      }
      onDismiss(outsideTap);
    },
    [isLocked, onDismiss],
  );

  const submit = async () => {
    if (
      !prize ||
      !claimAvailable ||
      isLocked ||
      inFlightRef.current ||
      !isAuthenticated
    ) {
      return;
    }
    if (!isAddressVisible) {
      setError("");
      setIsAddressVisible(true);
      return;
    }
    const recipientAddress = address.trim();
    if (!isValidSolanaAddress(recipientAddress)) {
      setError("Enter a valid Solana address.");
      return;
    }
    inFlightRef.current = true;
    setAddressValue(recipientAddress);
    setError("");
    setStatus("sending");
    try {
      await onWithdraw(prize, recipientAddress);
      if (!isMountedRef.current) {
        return;
      }
      setStatus("success");
      dismissTimeoutRef.current = window.setTimeout(() => {
        dismissTimeoutRef.current = null;
        if (isMountedRef.current) {
          onDismiss(false);
        }
      }, 1000);
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }
      inFlightRef.current = false;
      setStatus("idle");
      setError(getPrizeWithdrawalErrorMessage(error));
    }
  };

  return {
    address,
    setAddress,
    isAddressVisible,
    status,
    error,
    isLocked,
    submit,
    dismiss,
  };
};
