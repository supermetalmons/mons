import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { ColorSetKey, setBoardColorSet, getCurrentColorSetKey, colorSets, isPangchiuBoard } from "../content/boardStyles";
import { generateBoardPattern } from "../utils/boardPatternGenerator";
import { isMobile } from "../utils/misc";
import { toggleExperimentalMode } from "../game/board";

const PANGCHIU_PREVIEW_URL = "https://assets.mons.link/board/bg/thumb/Pangchiu.jpg";

let pangchiuImagePromise: Promise<string | null> | null = null;
let pangchiuImageUrl: string | null = null;
let pangchiuImageFailed = false;
let pangchiuImageDecoded = false;

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
  gap: 18px;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;

  @media screen and (max-height: 453px) {
    bottom: max(44px, calc(env(safe-area-inset-bottom) + 38px));
  }

  @media (prefers-color-scheme: dark) {
    background-color: var(--panel-dark-90);
  }
`;

export const ColorSquare = styled.button<{ isSelected?: boolean; colorSet: "light" | "dark" }>`
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

const BoardStylePickerComponent: React.FC = () => {
  const [currentColorSetKey, setCurrentColorSetKey] = useState<ColorSetKey>(getCurrentColorSetKey());
  const [isPangchiuBoardSelected, setIsPangchiuBoardSelected] = useState<boolean>(isPangchiuBoard());

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

  const handleColorSetChange = (colorSetKey: ColorSetKey) => (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setBoardColorSet(colorSetKey);
    toggleExperimentalMode(true, false, false, false);
    setCurrentColorSetKey(colorSetKey);
    setIsPangchiuBoardSelected(false);
  };

  const handlePangchiuBoardSelected = (event: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    event.preventDefault();
    toggleExperimentalMode(false, false, true, false);
    setIsPangchiuBoardSelected(true);
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

  return (
    <BoardStylePicker>
      <ColorSquare colorSet="light" isSelected={!isPangchiuBoardSelected && currentColorSetKey === "default"} onClick={!isMobile ? handleColorSetChange("default") : undefined} onTouchStart={isMobile ? handleColorSetChange("default") : undefined} aria-label="Light board theme">
        {renderColorSquares("light")}
      </ColorSquare>
      <ColorSquare colorSet="dark" isSelected={!isPangchiuBoardSelected && currentColorSetKey === "darkAndYellow"} onClick={!isMobile ? handleColorSetChange("darkAndYellow") : undefined} onTouchStart={isMobile ? handleColorSetChange("darkAndYellow") : undefined} aria-label="Dark board theme">
        {renderColorSquares("dark")}
      </ColorSquare>
      <ColorSquare colorSet="light" isSelected={isPangchiuBoardSelected} onClick={!isMobile ? handlePangchiuBoardSelected : undefined} onTouchStart={isMobile ? handlePangchiuBoardSelected : undefined} aria-label="Pangchiu board theme">
        {!imageLoaded && <ImagePlaceholderBg />}
        {!imageLoadFailed && pangchiuSrc && <PlaceholderImage src={pangchiuSrc} alt="" />}
      </ColorSquare>
    </BoardStylePicker>
  );
};

export default BoardStylePickerComponent;
