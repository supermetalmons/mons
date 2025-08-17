import React from "react";
import styled, { keyframes, css } from "styled-components";

const rainbowAura = keyframes`
  0% { 
    background: radial-gradient(circle at center, #ff0000 0%, #ff8000 20%, #ffff00 40%, #80ff00 60%, #00ff00 80%, #00ff80 100%);
    transform: rotate(0deg);
  }
  25% { 
    background: radial-gradient(circle at center, #ff8000 0%, #ffff00 20%, #80ff00 40%, #00ff00 60%, #00ff80 80%, #0080ff 100%);
    transform: rotate(90deg);
  }
  50% { 
    background: radial-gradient(circle at center, #ffff00 0%, #80ff00 20%, #00ff00 40%, #00ff80 60%, #0080ff 80%, #8000ff 100%);
    transform: rotate(180deg);
  }
  75% { 
    background: radial-gradient(circle at center, #80ff00 0%, #00ff00 20%, #00ff80 40%, #0080ff 60%, #8000ff 80%, #ff0080 100%);
    transform: rotate(270deg);
  }
  100% { 
    background: radial-gradient(circle at center, #00ff00 0%, #00ff80 20%, #0080ff 40%, #8000ff 60%, #ff0080 80%, #ff0000 100%);
    transform: rotate(360deg);
  }
`;

const AvatarContainer = styled.div<{ hasRainbowAura: boolean }>`
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 2px;
  overflow: hidden;
`;

const RainbowBackground = styled.div<{ hasRainbowAura: boolean }>`
  position: absolute;
  inset: 0;
  border-radius: 50%;
  z-index: 1;
  width: 80%;
  height: 80%;
  top: 10%;
  left: 10%;

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
