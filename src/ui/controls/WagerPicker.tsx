import type { MaterialImageUrls } from "../../resources/materialImageResources";
import {
  MATERIALS,
  type MaterialName,
} from "../../services/rocksMiningService";
import type { FrozenMaterialsStatus } from "../../services/wagerMaterialsService";
import { isMobile } from "../../utils/misc";
import {
  WagerBetButton,
  WagerButtonAmount,
  WagerButtonBadge,
  WagerButtonIcon,
  WagerMaterialAmount,
  WagerMaterialIcon,
  WagerMaterialItem,
  WagerMaterialsGrid,
} from "../BottomControlsStyles";
import type { BottomControlsUiState } from "./bottomControlsUiState";

export type WagerPickerProps = {
  selection: BottomControlsUiState["popups"]["reaction"]["selection"];
  materialAmounts: Record<MaterialName, number>;
  materialUrls: MaterialImageUrls;
  frozenMaterialsStatus: FrozenMaterialsStatus;
  hasFrozenSnapshot: boolean;
  wagerReady: boolean;
  onMaterialSelect: (name: MaterialName) => void;
  onSubmit: () => void;
};

export const WagerPicker = ({
  selection,
  materialAmounts,
  materialUrls,
  frozenMaterialsStatus,
  hasFrozenSnapshot,
  wagerReady,
  onMaterialSelect,
  onSubmit,
}: WagerPickerProps) => {
  const { name: wagerMaterial, count: wagerCount } = selection;

  return (
    <>
      <WagerBetButton
        $ready={wagerReady}
        onClick={wagerReady && !isMobile ? onSubmit : undefined}
        onTouchStart={wagerReady && isMobile ? onSubmit : undefined}
        disabled={!wagerReady}
        style={{
          cursor: wagerReady ? "pointer" : "default",
          opacity: wagerReady ? 1 : 0.6,
        }}
      >
        {frozenMaterialsStatus !== "ready" ? (
          frozenMaterialsStatus === "unavailable" ? (
            "Balance unavailable"
          ) : (
            "Checking balance"
          )
        ) : wagerMaterial && wagerCount > 0 ? (
          <>
            <span>Propose</span>
            <WagerButtonBadge>
              {materialUrls[wagerMaterial] && (
                <WagerButtonIcon
                  src={materialUrls[wagerMaterial] || ""}
                  alt=""
                  draggable={false}
                />
              )}
              <WagerButtonAmount>{wagerCount}</WagerButtonAmount>
            </WagerButtonBadge>
          </>
        ) : (
          "Select a Material"
        )}
      </WagerBetButton>
      <WagerMaterialsGrid>
        {MATERIALS.map((name) => (
          <WagerMaterialItem
            key={name}
            onClick={!isMobile ? () => onMaterialSelect(name) : undefined}
            onTouchStart={isMobile ? () => onMaterialSelect(name) : undefined}
            disabled={
              frozenMaterialsStatus !== "ready" || materialAmounts[name] <= 0
            }
            style={{ opacity: materialAmounts[name] > 0 ? 1 : 0.4 }}
          >
            {materialUrls[name] && (
              <WagerMaterialIcon
                src={materialUrls[name] || ""}
                alt=""
                draggable={false}
              />
            )}
            <WagerMaterialAmount>
              {hasFrozenSnapshot ? materialAmounts[name] : "—"}
            </WagerMaterialAmount>
          </WagerMaterialItem>
        ))}
      </WagerMaterialsGrid>
    </>
  );
};
