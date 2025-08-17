import React from "react";
import styled, { keyframes, css } from "styled-components";
import { colors } from "../content/boardStyles";

const r = colors.rainbow;

const rainbowRotation = keyframes`
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
`;

const AvatarContainer = styled.div<{ hasRainbowAura: boolean }>`
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 2px;
`;

const RainbowBackground = styled.div<{ hasRainbowAura: boolean }>`
  position: absolute;
  border-radius: 50%;
  z-index: 1;
  width: 110%;
  height: 110%;
  top: -5%;
  left: -5%;
  ${({ hasRainbowAura }) =>
    hasRainbowAura &&
    css`
      background: conic-gradient(${r[1]} 0deg, ${r[2]} 45deg, ${r[3]} 90deg, ${r[4]} 135deg, ${r[5]} 180deg, ${r[6]} 225deg, #0066ff 270deg, ${r[7]} 315deg, ${r[1]} 360deg);
      animation: ${rainbowRotation} 20s linear infinite;
      filter: blur(2px);
      opacity: 0.8;
    `}
`;

const StyledAvatarImage = styled.img`
  position: relative;
  width: 100%;
  height: 100%;
  object-fit: cover;
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
      {rainbowAura && <RainbowBackground hasRainbowAura={rainbowAura} />}
      <StyledAvatarImage src={src} alt={alt} loading={loading} />
    </AvatarContainer>
  );
};
