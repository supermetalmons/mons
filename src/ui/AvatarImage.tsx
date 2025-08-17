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
      background: conic-gradient(${r[1]} 0deg, ${r[2]} 51.428deg, ${r[3]} 102.857deg, ${r[4]} 154.286deg, ${r[5]} 205.714deg, ${r[6]} 257.143deg, ${r[7]} 308.571deg, ${r[1]} 360deg);
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
