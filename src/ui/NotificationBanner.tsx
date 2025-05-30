import React from "react";
import styled from "styled-components";

const NotificationBanner = styled.div<{ isVisible: boolean }>`
  position: fixed;
  top: 56px;
  right: 9pt;
  background-color: rgba(250, 250, 250, 0.95);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  border-radius: 7pt;
  padding: 0;
  width: min(280px, 85dvw);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  z-index: 6;
  opacity: ${(props) => (props.isVisible ? 1 : 0)};
  pointer-events: ${(props) => (props.isVisible ? "auto" : "none")};
  cursor: pointer;
  overflow: hidden;
  display: flex;
  align-items: center;
  height: 80px;
  -webkit-touch-callout: none;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition: opacity 0.3s ease;

  @media (prefers-color-scheme: dark) {
    background-color: rgba(35, 35, 35, 0.95);
    color: #f5f5f5;
  }

  @media screen and (max-height: 500px) {
    top: 53px;
  }

  @media screen and (max-height: 453px) {
    top: 50px;
  }

  @media screen and (max-width: 420px) {
    right: 8px;
  }

  @media screen and (max-width: 387px) {
    right: 6px;
  }
`;

const NotificationImage = styled.img`
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: 6px;
  flex-shrink: 0;
  margin-left: 12px;
  align-self: center;
`;

const NotificationContent = styled.div`
  flex: 1;
  padding: 12px 8px;
  padding-right: 40px;
  display: flex;
  flex-direction: column;
  justify-content: center;
`;

const NotificationTitle = styled.div`
  font-size: 18px;
  font-weight: 800;
  color: #0066cc;
  margin-bottom: 2px;
  line-height: 1.2;
  text-align: left;

  @media (prefers-color-scheme: dark) {
    color: #66b3ff;
  }
`;

const NotificationSubtitle = styled.div`
  font-size: 13px;
  font-weight: 500;
  color: #696969;
  line-height: 1.3;
  text-align: left;

  @media (prefers-color-scheme: dark) {
    color: #999;
  }
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fbfbfb;
  border: none;
  color: #cecece;
  cursor: pointer;
  font-size: 18px;
  font-weight: 230;
  line-height: 18px;
  position: absolute;
  border-radius: 50%;
  height: 26px;
  width: 26px;
  right: 6px;
  top: 6px;
  padding: 0;
  -webkit-touch-callout: none;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
  -webkit-tap-highlight-color: transparent;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background: #f0f0f0;
      color: #999;
    }
  }

  @media (prefers-color-scheme: dark) {
    color: #424242;
    background: #232323;

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background: #2a2a2a;
        color: #696969;
      }
    }
  }
`;

interface NotificationBannerComponentProps {
  isVisible: boolean;
  onClose: () => void;
  onClick: () => void;
}

export const NotificationBannerComponent: React.FC<NotificationBannerComponentProps> = ({ isVisible, onClose, onClick }) => {
  const handleNotificationClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  };

  const handleCloseClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onClose();
  };

  return (
    <NotificationBanner isVisible={isVisible} onClick={handleNotificationClick}>
      <NotificationImage src="https://assets.mons.link/emojipack/104.webp" alt="Notification" />
      <NotificationContent>
        <NotificationTitle>Play Now</NotificationTitle>
        <NotificationSubtitle>New puzzles available</NotificationSubtitle>
      </NotificationContent>
      <CloseButton onClick={handleCloseClick}>×</CloseButton>
    </NotificationBanner>
  );
};
