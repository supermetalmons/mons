import React from "react";
import styled from "styled-components";
import { colors } from "../content/boardStyles";

const r = colors.rainbow;

const AvatarContainer = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 2px;
`;

const RainbowBackground = styled.div`
  position: absolute;
  z-index: 1;
  width: 163%;
  height: 163%;
  top: -17%;
  left: -17%;
  filter: blur(2px);
  opacity: 0.99;
`;

const RainbowInner = styled.div<{ src: string }>`
  position: absolute;
  inset: 0;
  background: conic-gradient(${r[7]} 0deg, #0066ff 45deg, ${r[6]} 90deg, ${r[5]} 135deg, ${r[4]} 180deg, ${r[3]} 225deg, ${r[2]} 270deg, ${r[1]} 315deg, ${r[7]} 360deg);
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
  onLoad?: () => void;
}

export const AvatarImage: React.FC<AvatarImageProps> = ({ src, alt, rainbowAura = false, loading = "lazy", onLoad }) => {
  return (
    <AvatarContainer>
      {rainbowAura && (
        <RainbowBackground>
          <RainbowInner src={src} />
        </RainbowBackground>
      )}
      <StyledAvatarImage src={src} alt={alt} loading={loading} onLoad={onLoad} />
    </AvatarContainer>
  );
};
