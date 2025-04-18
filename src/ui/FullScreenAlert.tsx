import React from "react";
import styled from "styled-components";

interface FullScreenAlertProps {
  title: string;
  subtitle: string;
}

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: "transparent";
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 0;
  cursor: pointer;
  pointer-events: none;

  @media (prefers-color-scheme: dark) {
    background-color: "transparent";
  }
`;

const Content = styled.div`
  background-color: rgba(250, 250, 250, 0.95);
  padding: 10px;
  border-radius: 7pt;
  width: 85%;
  max-width: 320px;
  text-align: center;
  cursor: default;
  pointer-events: none;
  border: 0 solid #007aff;

  @media (prefers-color-scheme: dark) {
    background-color: rgba(35, 35, 35, 0.95);
    border: 0 solid #0b84ff;
    color: #f5f5f5;
  }
`;

const Title = styled.h2`
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;

  @media (prefers-color-scheme: dark) {
    color: #f5f5f5;
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

const FullScreenAlert: React.FC<FullScreenAlertProps> = ({ title, subtitle }) => {
  return (
    <Overlay>
      <Content>
        <Title dangerouslySetInnerHTML={{ __html: title }}></Title>
        {subtitle && <Subtitle>{subtitle}</Subtitle>}
      </Content>
    </Overlay>
  );
};

export default FullScreenAlert;
