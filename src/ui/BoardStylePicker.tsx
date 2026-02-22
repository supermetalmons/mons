import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { AssetsSet, BoardStyleSet, ColorSetKey, setBoardColorSet, getCurrentColorSetKey, colorSets, getCurrentAssetsSet, getCurrentBoardStyleSet, subscribeToAssetsSetChanges, subscribeToBoardColorSetChanges, subscribeToBoardStyleSetChanges } from "../content/boardStyles";
import { generateBoardPattern } from "../utils/boardPatternGenerator";
import { isMobile } from "../utils/misc";
import { setBoardStyleSet, setItemsStyleSet } from "../game/board";

const PANGCHIU_PREVIEW_URL = "https://assets.mons.link/board/bg/thumb/Pangchiu.jpg";

let pangchiuImagePromise: Promise<string | null> | null = null;
let pangchiuImageUrl: string | null = null;
let pangchiuImageFailed = false;
let pangchiuImageDecoded = false;

type ItemStylePreviewUrls = Record<AssetsSet, string | null>;

const EMPTY_ITEM_STYLE_PREVIEWS: ItemStylePreviewUrls = {
  [AssetsSet.Pixel]: null,
  [AssetsSet.Original]: null,
  [AssetsSet.Pangchiu]: null,
};

const getItemStylePreviewUrl = async (assetsSet: AssetsSet): Promise<string | null> => {
  try {
    const module = await import(`../assets/gameAssets${assetsSet}`);
    return `url(data:image/webp;base64,${module.gameAssets.supermana})`;
  } catch {
    return null;
  }
};

const getPangchiuImageUrl = () => {
  if (pangchiuImageUrl) {
    return Promise.resolve(pangchiuImageUrl);
  }
  if (pangchiuImageFailed) {
    return Promise.resolve(null);
  }
  if (!pangchiuImagePromise) {
    pangchiuImagePromise = fetch(PANGCHIU_PREVIEW_URL)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch image");
        return res.blob();
      })
      .then((blob) => {
        pangchiuImageUrl = URL.createObjectURL(blob);
        return pangchiuImageUrl;
      })
      .catch(() => {
        pangchiuImageFailed = true;
        return null;
      });
  }
  return pangchiuImagePromise.then((url) => {
    if (!url) {
      pangchiuImageFailed = true;
    }
    return url;
  });
};

export const preloadPangchiuBoardPreview = () => {
  if (pangchiuImageUrl || pangchiuImageFailed || typeof window === "undefined") {
    return;
  }
  getPangchiuImageUrl()
    .then((url) => {
      if (!url || typeof Image === "undefined") return;
      const img = new Image();
      img.src = url;
      if (typeof img.decode === "function") {
        img.decode()
          .then(() => {
            pangchiuImageDecoded = true;
          })
          .catch(() => {});
      } else {
        img.onload = () => {
          pangchiuImageDecoded = true;
        };
      }
    })
    .catch(() => {});
};

export const BoardStylePicker = styled.div`
  position: fixed;
  bottom: max(50px, calc(env(safe-area-inset-bottom) + 44px));
  left: 8px;
  background-color: var(--panel-light-90);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  overflow: hidden;

  @media screen and (max-height: 453px) {
    bottom: max(44px, calc(env(safe-area-inset-bottom) + 38px));
  }

  @media (prefers-color-scheme: dark) {
    background-color: var(--panel-dark-90);
  }
`;

const SectionRow = styled.div`
  display: flex;
  gap: 12px;
  position: relative;
  z-index: 1;
`;

const OptionButton = styled.button<{ isSelected?: boolean }>`
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  border-radius: 10px;
  border: 4px solid transparent;
  outline: none;
  cursor: pointer;
  position: relative;
  -webkit-tap-highlight-color: transparent;
  padding: 0;
  overflow: hidden;
  background: transparent;
  transition: all 0.15s ease;
  touch-action: none;
  user-select: none;
  -webkit-touch-callout: none;
  -webkit-user-select: none;

  ${(props) =>
    props.isSelected &&
    `
    border-color: var(--color-blue-primary);
    box-shadow: 0 0 0 3px var(--selectedBorderShadowColor);
  `}

  @media (prefers-color-scheme: dark) {
    ${(props) =>
      props.isSelected &&
      `
      border-color: var(--color-blue-primary-dark);
      box-shadow: 0 0 0 3px var(--selectedBorderShadowColorDark);
    `}
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      ${(props) =>
        !props.isSelected &&
        `
        border-color: var(--focusBorderColor);
        box-shadow: 0 0 0 2px var(--focusShadowColor);

        @media (prefers-color-scheme: dark) {
          border-color: var(--focusBorderColorDark);
          box-shadow: 0 0 0 2px var(--focusShadowColorDark);
        }
      `}
    }
  }

  &:active {
    transform: scale(0.94);
    transition: transform 0.08s ease;
  }

  @media (hover: none) and (pointer: coarse) {
    &:active {
      ${(props) =>
        !props.isSelected &&
        `
        border-color: var(--focusBorderColor);
        box-shadow: 0 0 0 2px var(--focusShadowColor);
        @media (prefers-color-scheme: dark) {
          border-color: var(--focusBorderColorDark);
          box-shadow: 0 0 0 2px var(--focusShadowColorDark);
        }
      `}
    }
  }

`;

export const ColorSquare = styled(OptionButton)`
  svg {
    position: absolute;
    top: 0;
    left: 0;
    width: 102%;
    height: 102%;
    transform: translate(-1%, -1%);
    border-radius: 6px;
    pointer-events: none;
  }
`;

const ItemStyleButton = styled.button<{ isSelected?: boolean }>`
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  border: none;
  outline: none;
  cursor: pointer;
  position: relative;
  -webkit-tap-highlight-color: transparent;
  padding: 0;
  background: transparent;
  touch-action: none;
  user-select: none;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  opacity: ${(props) => (props.isSelected ? 1 : 0.45)};
  filter: ${(props) => (props.isSelected ? "drop-shadow(0 0 4px rgba(59, 130, 246, 0.95))" : "none")};
  transition: transform 0.1s ease, filter 0.2s ease, opacity 0.2s ease;

  @media (prefers-color-scheme: dark) {
    filter: ${(props) => (props.isSelected ? "drop-shadow(0 0 4px rgba(100, 165, 255, 0.95))" : "none")};
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      opacity: 1;
    }
  }

  &:active {
    transform: scale(0.94);
  }
`;

const ItemStylePreview = styled.div<{ itemSet: AssetsSet; previewUrl: string | null }>`
  width: 100%;
  height: 100%;
  background-image: ${(props) => props.previewUrl ?? "none"};
  background-size: 94%;
  background-position: center;
  background-repeat: no-repeat;
  ${(props) =>
    props.itemSet === AssetsSet.Pixel &&
    `
    image-rendering: pixelated;
  `}
`;

export const PlaceholderImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scale(1.01);
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;
  touch-action: none;
  pointer-events: none;
`;

export const ImagePlaceholderBg = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: var(--color-gray-d0);
  border-radius: 6px;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  pointer-events: none;
  touch-action: none;

  @media (prefers-color-scheme: dark) {
    background-color: var(--color-gray-a0);
  }
`;

const FLOW_STEP = 56;

const FlowSvg = styled.svg`
  position: absolute;
  top: 16px;
  left: 16px;
  width: calc(100% - 32px);
  height: calc(100% - 32px);
  pointer-events: none;

  .fg {
    fill: none;
    stroke: rgba(59, 130, 246, 0.18);
    stroke-width: 7;
    stroke-linecap: round;
  }

  .fl {
    fill: none;
    stroke: rgba(59, 130, 246, 0.6);
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-dasharray: 3 5;
    animation: efd 0.6s linear infinite;
  }

  @keyframes efd {
    to {
      stroke-dashoffset: -8;
    }
  }

  @media (prefers-color-scheme: dark) {
    .fg {
      stroke: rgba(100, 165, 255, 0.18);
    }
    .fl {
      stroke: rgba(100, 165, 255, 0.6);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .fl {
      animation: none;
    }
  }
`;

const FlowLine: React.FC<{ from: number; to: number }> = React.memo(({ from, to }) => {
  const x1 = 22 + from * FLOW_STEP;
  const x2 = 22 + to * FLOW_STEP;
  const d = `M${x1},22C${x1},49 ${x2},49 ${x2},76`;
  return (
    <FlowSvg viewBox="0 0 156 98">
      <path d={d} className="fg" />
      <path d={d} className="fl" />
    </FlowSvg>
  );
});

const BoardStylePickerComponent: React.FC = () => {
  const [currentColorSetKey, setCurrentColorSetKey] = useState<ColorSetKey>(getCurrentColorSetKey());
  const [selectedBoardStyleSet, setSelectedBoardStyleSet] = useState<BoardStyleSet>(getCurrentBoardStyleSet());
  const [selectedItemsStyleSet, setSelectedItemsStyleSet] = useState<AssetsSet>(getCurrentAssetsSet());
  const [itemStylePreviewUrls, setItemStylePreviewUrls] = useState<ItemStylePreviewUrls>(EMPTY_ITEM_STYLE_PREVIEWS);

  const [imageLoadFailed, setImageLoadFailed] = useState(pangchiuImageFailed);
  const [imageLoaded, setImageLoaded] = useState(pangchiuImageDecoded);
  const [pangchiuSrc, setPangchiuSrc] = useState<string | null>(pangchiuImageUrl);

  useEffect(() => {
    let cancelled = false;
    getPangchiuImageUrl().then((url) => {
      if (cancelled) return;
      if (url) {
        setPangchiuSrc(url);
        if (pangchiuImageDecoded) {
          setImageLoaded(true);
          return;
        }
        if (typeof Image === "undefined") {
          setImageLoaded(true);
          return;
        }
        const img = new Image();
        img.src = url;
        const decodePromise =
          typeof img.decode === "function"
            ? img.decode()
            : new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject();
              });
        decodePromise
          .then(() => {
            if (cancelled) return;
            pangchiuImageDecoded = true;
            setImageLoaded(true);
          })
          .catch(() => {
            if (!cancelled) {
              setImageLoadFailed(true);
            }
          });
      } else {
        setImageLoadFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all(Object.values(AssetsSet).map(async (assetsSet) => [assetsSet, await getItemStylePreviewUrl(assetsSet)] as const)).then((entries) => {
      if (cancelled) {
        return;
      }
      const nextPreviewUrls: ItemStylePreviewUrls = { ...EMPTY_ITEM_STYLE_PREVIEWS };
      entries.forEach(([assetsSet, previewUrl]) => {
        nextPreviewUrls[assetsSet] = previewUrl;
      });
      setItemStylePreviewUrls(nextPreviewUrls);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsubscribeBoardColorSet = subscribeToBoardColorSetChanges(() => {
      setCurrentColorSetKey(getCurrentColorSetKey());
    });
    const unsubscribeBoardStyleSet = subscribeToBoardStyleSetChanges(() => {
      setSelectedBoardStyleSet(getCurrentBoardStyleSet());
    });
    const unsubscribeAssetsSet = subscribeToAssetsSetChanges(() => {
      setSelectedItemsStyleSet(getCurrentAssetsSet());
    });
    return () => {
      unsubscribeBoardColorSet();
      unsubscribeBoardStyleSet();
      unsubscribeAssetsSet();
    };
  }, []);

  const handleColorSetChange = (colorSetKey: ColorSetKey) => (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setBoardColorSet(colorSetKey);
    setBoardStyleSet(BoardStyleSet.Grid);
    setCurrentColorSetKey(getCurrentColorSetKey());
    setSelectedBoardStyleSet(getCurrentBoardStyleSet());
  };

  const handlePangchiuBoardSelected = (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setBoardStyleSet(BoardStyleSet.Pangchiu);
    setSelectedBoardStyleSet(getCurrentBoardStyleSet());
  };

  const handleItemsStyleSetChange = (assetsSet: AssetsSet) => (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setItemsStyleSet(assetsSet);
    setSelectedItemsStyleSet(getCurrentAssetsSet());
  };

  const renderColorSquares = (colorSet: "light" | "dark") => {
    const colors = colorSet === "light" ? colorSets.default : colorSets.darkAndYellow;
    const boardSize = 11;
    const cellSize = 38 / boardSize;
    return (
      <svg viewBox="0 0 38 38" width="38" height="38">
        {generateBoardPattern({
          colorSet: colors,
          size: 38,
          cellSize: cellSize,
          offsetY: 0,
          keyPrefix: `preview-${colorSet}`,
        })}
      </svg>
    );
  };

  const isGridBoardSelected = selectedBoardStyleSet === BoardStyleSet.Grid;
  const boardIndex = isGridBoardSelected ? (currentColorSetKey === "default" ? 0 : 1) : 2;
  const itemsIndex = selectedItemsStyleSet === AssetsSet.Pixel ? 0 : selectedItemsStyleSet === AssetsSet.Original ? 1 : 2;

  return (
    <BoardStylePicker>
      <FlowLine from={boardIndex} to={itemsIndex} />
      <SectionRow>
        <ColorSquare isSelected={isGridBoardSelected && currentColorSetKey === "default"} onClick={!isMobile ? handleColorSetChange("default") : undefined} onTouchStart={isMobile ? handleColorSetChange("default") : undefined} aria-label="Light board theme">
          {renderColorSquares("light")}
        </ColorSquare>
        <ColorSquare isSelected={isGridBoardSelected && currentColorSetKey === "darkAndYellow"} onClick={!isMobile ? handleColorSetChange("darkAndYellow") : undefined} onTouchStart={isMobile ? handleColorSetChange("darkAndYellow") : undefined} aria-label="Dark board theme">
          {renderColorSquares("dark")}
        </ColorSquare>
        <ColorSquare isSelected={selectedBoardStyleSet === BoardStyleSet.Pangchiu} onClick={!isMobile ? handlePangchiuBoardSelected : undefined} onTouchStart={isMobile ? handlePangchiuBoardSelected : undefined} aria-label="Pangchiu board theme">
          {!imageLoaded && <ImagePlaceholderBg />}
          {!imageLoadFailed && pangchiuSrc && <PlaceholderImage src={pangchiuSrc} alt="" />}
        </ColorSquare>
      </SectionRow>
      <SectionRow>
        <ItemStyleButton isSelected={selectedItemsStyleSet === AssetsSet.Pixel} onClick={!isMobile ? handleItemsStyleSetChange(AssetsSet.Pixel) : undefined} onTouchStart={isMobile ? handleItemsStyleSetChange(AssetsSet.Pixel) : undefined} aria-label="Pixel item style">
          <ItemStylePreview itemSet={AssetsSet.Pixel} previewUrl={itemStylePreviewUrls[AssetsSet.Pixel]} />
        </ItemStyleButton>
        <ItemStyleButton isSelected={selectedItemsStyleSet === AssetsSet.Original} onClick={!isMobile ? handleItemsStyleSetChange(AssetsSet.Original) : undefined} onTouchStart={isMobile ? handleItemsStyleSetChange(AssetsSet.Original) : undefined} aria-label="Original item style">
          <ItemStylePreview itemSet={AssetsSet.Original} previewUrl={itemStylePreviewUrls[AssetsSet.Original]} />
        </ItemStyleButton>
        <ItemStyleButton isSelected={selectedItemsStyleSet === AssetsSet.Pangchiu} onClick={!isMobile ? handleItemsStyleSetChange(AssetsSet.Pangchiu) : undefined} onTouchStart={isMobile ? handleItemsStyleSetChange(AssetsSet.Pangchiu) : undefined} aria-label="Pangchiu item style">
          <ItemStylePreview itemSet={AssetsSet.Pangchiu} previewUrl={itemStylePreviewUrls[AssetsSet.Pangchiu]} />
        </ItemStyleButton>
      </SectionRow>
    </BoardStylePicker>
  );
};

export default BoardStylePickerComponent;
