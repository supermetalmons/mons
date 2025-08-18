import React from "react";
import styled, { keyframes, css, createGlobalStyle } from "styled-components";
import { colors } from "../content/boardStyles";

const r = colors.rainbow;

const RainbowAuraStyles = createGlobalStyle`
  @property --a {
    syntax: "<angle>";
    inherits: false;
    initial-value: 0deg;
  }
`;

const hueSpin = keyframes`
  to { --a: 360deg; }
`;

const AvatarContainer = styled.div<{ hasRainbowAura: boolean }>`
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 2px;
  overflow: visible;
`;

const Aura = styled.div<{ $src: string; $active: boolean }>`
  position: absolute;
  inset: -10%;
  z-index: 1;
  pointer-events: none;
  transform: scale(1.11);

  ${({ $active }) =>
    $active &&
    css`
      --a: 0deg;
      background: conic-gradient(from var(--a), ${r[1]} 0deg, ${r[2]} 45deg, ${r[3]} 90deg, ${r[4]} 135deg, ${r[5]} 180deg, ${r[6]} 225deg, #0066ff 270deg, ${r[7]} 315deg, ${r[1]} 360deg);
      -webkit-mask-image: var(--mask-url);
      -webkit-mask-repeat: no-repeat;
      -webkit-mask-position: center;
      -webkit-mask-size: contain;
      mask-image: var(--mask-url);
      mask-repeat: no-repeat;
      mask-position: center;
      mask-size: contain;
      filter: blur(12px);
      opacity: 1;
      animation: ${hueSpin} 10s linear infinite;
    `}

  ${({ $src }) => css`
    --mask-url: url(${$src});
  `}
`;

const StyledAvatarImage = styled.img`
  position: relative;
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  border-radius: 2px;
  pointer-events: none;
  -webkit-user-drag: none;
  user-drag: none;
  z-index: 2;
`;

interface AvatarImageProps {
  src: string;
  alt: string;
  rainbowAura?: boolean;
  loading?: "lazy" | "eager";
}

export const AvatarImage: React.FC<AvatarImageProps> = ({ src, alt, rainbowAura = false, loading = "lazy" }) => {
  return (
    <AvatarContainer hasRainbowAura={rainbowAura}>
      <RainbowAuraStyles />
      {rainbowAura && <Aura $src={src} $active={rainbowAura} />}
      <StyledAvatarImage src={src} alt={alt} loading={loading} />
    </AvatarContainer>
  );
};
