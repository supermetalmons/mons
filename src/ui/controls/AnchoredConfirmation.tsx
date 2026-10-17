import type { ReactNode, Ref } from "react";
import { ResignConfirmation } from "../BottomControlsStyles";

export const AnchoredConfirmation = ({
  ref,
  left,
  children,
}: {
  ref: Ref<HTMLDivElement>;
  left: number | null;
  children: ReactNode;
}) => (
  <ResignConfirmation
    ref={ref}
    style={
      left !== null
        ? {
            left: `${left}px`,
            right: "auto",
            transform: "translateX(-50%)",
          }
        : undefined
    }
  >
    {children}
  </ResignConfirmation>
);
