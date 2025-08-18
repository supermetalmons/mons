import React from "react";
import styled, { keyframes } from "styled-components";
import { colors } from "../content/boardStyles";

const r = colors.rainbow;

const rainbowRotation = keyframes`
  0% {
    filter: hue-rotate(0deg);
  }
  100% {
    filter: hue-rotate(360deg);
  }
`;

const AvatarContainer = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 2px;
`;

const RainbowBackground = styled.div`
  position: absolute;
  z-index: 1;
  width: 130%;
  height: 130%;
  top: -15%;
  left: -15%;
  filter: blur(2px);
  opacity: 0.8;
`;

const RainbowInner = styled.div<{ src: string }>`
  position: absolute;
  inset: 0;
  background: conic-gradient(${r[1]} 0deg, ${r[2]} 45deg, ${r[3]} 90deg, ${r[4]} 135deg, ${r[5]} 180deg, ${r[6]} 225deg, #0066ff 270deg, ${r[7]} 315deg, ${r[1]} 360deg);
  animation: ${rainbowRotation} 10s linear infinite;
  -webkit-mask-image: url(${({ src }) => src});
  mask-image: url(${({ src }) => src});
  mask-size: 76.923% 76.923%;
  mask-position: 11.538% 11.538%;
  mask-repeat: no-repeat;
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
    <AvatarContainer>
      {rainbowAura && (
        <RainbowBackground>
          <RainbowInner src={src} />
        </RainbowBackground>
      )}
      <StyledAvatarImage src={src} alt={alt} loading={loading} />
    </AvatarContainer>
  );
};
