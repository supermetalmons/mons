import React, { useEffect } from "react";
import { didDismissSomethingWithOutsideTapJustNow } from "./BottomControls";
import { defaultEarlyInputEventName } from "../utils/misc";

interface FullScreenAlertProps {
  title: string;
  subtitle: string;
  onDismiss: () => void;
}

const styles = {
  overlay: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
    cursor: "pointer",
  },
  content: {
    backgroundColor: "white",
    padding: "2rem",
    borderRadius: "1rem",
    maxWidth: "90%",
    width: "400px",
    textAlign: "center" as const,
    boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
    cursor: "pointer",
  },
  title: {
    margin: "0 0 1rem 0",
    fontSize: "1.5rem",
    fontWeight: 600,
    color: "#1a1a1a",
  },
  subtitle: {
    margin: 0,
    fontSize: "1rem",
    color: "#555",
    lineHeight: 1.5,
  },
  "@media (prefers-color-scheme: dark)": {
    overlay: {
        backgroundColor: "rgba(0, 0, 0, 0.5)",
      },
    content: {
      backgroundColor: "#1a1a1a",
    },
    title: {
      color: "white",
    },
    subtitle: {
      color: "#ccc",
    },
  },
};

const FullScreenAlert: React.FC<FullScreenAlertProps> = ({ title, subtitle, onDismiss }) => {
  useEffect(() => {
    const handleClick = (event: TouchEvent | MouseEvent) => {
      event.stopPropagation();
      didDismissSomethingWithOutsideTapJustNow();
      onDismiss();
    };
    document.addEventListener(defaultEarlyInputEventName, handleClick);
    return () => document.removeEventListener(defaultEarlyInputEventName, handleClick);
  }, [onDismiss]);

  return (
    <div style={styles.overlay}>
      <div style={styles.content} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.title}>{title}</h2>
        <p style={styles.subtitle}>{subtitle}</p>
      </div>
    </div>
  );
};

export default FullScreenAlert;
