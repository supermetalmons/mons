import React from "react";
import styled, { keyframes, css } from "styled-components";
import { colors } from "../content/boardStyles";

const r = colors.rainbow;

const rainbowAura = keyframes`
  0% { 
    background: radial-gradient(circle at center, ${r[1]} 0%, ${r[2]} 20%, ${r[3]} 40%, ${r[4]} 60%, ${r[5]} 80%, ${r[6]} 100%);
    transform: rotate(0deg);
  }
  25% { 
    background: radial-gradient(circle at center, ${r[2]} 0%, ${r[3]} 20%, ${r[4]} 40%, ${r[5]} 60%, ${r[6]} 80%, ${r[7]} 100%);
    transform: rotate(90deg);
  }
  50% { 
    background: radial-gradient(circle at center, ${r[3]} 0%, ${r[4]} 20%, ${r[5]} 40%, ${r[6]} 60%, ${r[7]} 80%, ${r[1]} 100%);
    transform: rotate(180deg);
  }
  75% { 
    background: radial-gradient(circle at center, ${r[4]} 0%, ${r[5]} 20%, ${r[6]} 40%, ${r[7]} 60%, ${r[1]} 80%, ${r[2]} 100%);
    transform: rotate(270deg);
  }
  100% { 
    background: radial-gradient(circle at center, ${r[5]} 0%, ${r[6]} 20%, ${r[7]} 40%, ${r[1]} 60%, ${r[2]} 80%, ${r[3]} 100%);
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
      animation: ${rainbowAura} 4s linear infinite;
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
