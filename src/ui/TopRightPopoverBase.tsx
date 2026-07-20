import styled, { type DataAttributes } from "styled-components";

export const TopRightPopoverBase = styled.div.attrs<DataAttributes>({
  "data-top-right-popover": "true",
})<{ $isOpen: boolean }>`
  position: fixed;
  top: 56px;
  right: 9pt;
  font-size: 12px;
  background-color: var(--overlay-light-95);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  border-radius: 7pt;
  box-shadow: none;
  z-index: 80030;
  opacity: ${(props) => (props.$isOpen ? 1 : 0)};
  transform: translateY(${(props) => (props.$isOpen ? "0" : "-4px")});
  visibility: ${(props) => (props.$isOpen ? "visible" : "hidden")};
  pointer-events: ${(props) => (props.$isOpen ? "auto" : "none")};
  cursor: default;
  outline: none;
  transition:
    opacity 150ms ease,
    transform 150ms ease,
    visibility 0s linear ${(props) => (props.$isOpen ? "0ms" : "150ms")};

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }

  @media (prefers-color-scheme: dark) {
    background-color: var(--overlay-dark-95);
    color: var(--color-gray-f5);
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
