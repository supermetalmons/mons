import React, { useEffect } from "react";
import styled from "styled-components";
import { didDismissSomethingWithOutsideTapJustNow } from "./BottomControls";
import { defaultEarlyInputEventName } from "../utils/misc";

interface FullScreenAlertProps {
  title: string;
  subtitle: string;
  onDismiss: () => void;
}

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.15);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  cursor: pointer;

  @media (prefers-color-scheme: dark) {
    background-color: rgba(0, 0, 0, 0.3);
  }
`;

const Content = styled.div`
  background-color: rgba(255, 255, 255, 0.97);
  padding: 10px;
  border-radius: 16px;
  width: 85%;
  max-width: 320px;
  text-align: center;
  cursor: default;

  @media (prefers-color-scheme: dark) {
    background-color: rgba(26, 26, 26, 0.97);
  }
`;

const Title = styled.h2`
  font-size: 12px;
  font-weight: 500;
  color: #000;
  line-height: 1.5;

  @media (prefers-color-scheme: dark) {
    color: #fff;
  }
`;

const Subtitle = styled.p`
  margin: 0;
  font-size: 1rem;
  color: #555;
  line-height: 1.5;

  @media (prefers-color-scheme: dark) {
    color: #ccc;
  }
`;

const FullScreenAlert: React.FC<FullScreenAlertProps> = ({ title, subtitle, onDismiss }) => {
  useEffect(() => {
    const handleClick = (event: TouchEvent | MouseEvent) => {
      event.stopPropagation();
      didDismissSomethingWithOutsideTapJustNow();
      onDismiss();
    };
    document.addEventListener(defaultEarlyInputEventName, handleClick);
    return () => document.removeEventListener(defaultEarlyInputEventName, handleClick);
  }, [onDismiss]);

  return (
    <Overlay>
      <Content onClick={(e) => e.stopPropagation()}>
        <Title dangerouslySetInnerHTML={{ __html: title }}></Title>
        {subtitle && <Subtitle>{subtitle}</Subtitle>}
      </Content>
    </Overlay>
  );
};

export default FullScreenAlert;
