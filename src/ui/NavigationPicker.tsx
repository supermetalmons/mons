import React, { useRef } from "react";
import styled from "styled-components";
import { problems } from "../content/problems";
import { didSelectPuzzle } from "../game/gameController";

const NavigationPickerContainer = styled.div`
  position: fixed;
  bottom: auto;
  right: 9pt;
  top: 56px;
  max-height: 146pt;
  max-width: 90pt;
  min-width: 88pt;
  overflow-y: auto;
  opacity: 1;
  cursor: pointer;
  overscroll-behavior: contain;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
  background-color: rgba(249, 249, 249, 0.9);
  border-radius: 7pt;
  padding-top: 5px;
  padding-left: 0;
  padding-right: 0pt;
  padding-bottom: 0px;
  gap: 0px;
  z-index: 5;

  @media (prefers-color-scheme: dark) {
    background-color: rgba(36, 36, 36, 0.9);
  }
`;

const SectionTitle = styled.div`
  font-size: 0.5rem;
  font-weight: bold;
  color: #767787;
  text-align: left;
  padding-top: 1px;
  padding-left: 8px;
  padding-bottom: 2pt;
  cursor: pointer;

  @media (prefers-color-scheme: dark) {
    color: #a0a0a0;
  }
`;

const NavigationPickerButton = styled.button`
  background: none;
  border: none;
  padding: 6px 8px;
  padding-right: 15px;
  cursor: pointer;
  text-align: left;
  color: #333;
  width: 100%;
  text-align: left;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background-color: rgba(232, 232, 232, 0.5);
    }
  }

  &:active {
    background-color: rgba(224, 224, 224, 0.6);
  }

  @media (prefers-color-scheme: dark) {
    color: #f0f0f0;

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: rgba(70, 70, 70, 0.4);
      }
    }

    &:active {
      background-color: rgba(80, 80, 80, 0.5);
    }
  }
`;

const NavigationPicker: React.FC = () => {
  const navigationPickerRef = useRef<HTMLDivElement>(null);

  const handleNavigationSelect = (id: string) => {
    const selectedItem = problems.find((item) => item.id === id);
    if (selectedItem) {
      didSelectPuzzle(selectedItem);
    }
  };

  return (
    <NavigationPickerContainer
      ref={navigationPickerRef}
      onTouchStart={(e) => {
        e.stopPropagation();
      }}
      onTouchMove={(e) => {
        e.stopPropagation();
      }}
      onWheel={(e) => {
        e.stopPropagation();
      }}>
      <SectionTitle>BASICS</SectionTitle>
      {problems.map((item) => (
        <NavigationPickerButton key={item.id} onClick={() => handleNavigationSelect(item.id)}>
          {item.label}
        </NavigationPickerButton>
      ))}
    </NavigationPickerContainer>
  );
};

export default NavigationPicker;
