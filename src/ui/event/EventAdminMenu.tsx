import { useEffect, useId, useRef, useState } from "react";
import { FaEllipsisH } from "react-icons/fa";
import styled from "styled-components";
import { BottomPillButton } from "../BottomControlsStyles";
import { didDismissSomethingWithOutsideTapJustNow } from "../controls/outsideTapState";
import { EVENT_MODAL_Z_INDEX } from "./modalState";

const Container = styled.div`
  position: fixed;
  top: max(16px, env(safe-area-inset-top));
  left: max(12px, env(safe-area-inset-left));
  z-index: ${EVENT_MODAL_Z_INDEX + 2};
  cursor: default;
`;

const Trigger = styled(BottomPillButton)`
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 50%;

  svg {
    width: 16px;
    height: 16px;
    margin: 0 !important;
  }
`;

const Menu = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  min-width: 180px;
  max-width: calc(100vw - 24px);
  padding: 4px;
  border-radius: 12px;
  background: var(--overlay-light-95);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);

  @media (prefers-color-scheme: dark) {
    background: var(--overlay-dark-95);
  }
`;

const MenuItem = styled.button`
  display: block;
  width: 100%;
  min-height: 40px;
  padding: 8px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--color-blue-primary);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;

  &:hover:not(:disabled),
  &:focus-visible {
    background: var(--color-gray-f0);
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }

  @media (prefers-color-scheme: dark) {
    color: var(--color-blue-primary-dark);

    &:hover:not(:disabled),
    &:focus-visible {
      background: var(--color-gray-33);
    }
  }
`;

type AdminAction = {
  label: string;
  disabled: boolean;
  onSelect: () => void;
};

export const EventAdminMenu = ({ actions }: { actions: AdminAction[] }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusLastOnOpenRef = useRef(false);
  const enabledActions = actions
    .filter((action) => !action.disabled)
    .map((action) => action.label)
    .join("\n");

  const close = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!isOpen) return;
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ) ?? [],
    );
    const initialItem = focusLastOnOpenRef.current
      ? items[items.length - 1]
      : items[0];
    focusLastOnOpenRef.current = false;
    if (!items.includes(document.activeElement as HTMLButtonElement)) {
      (initialItem ?? triggerRef.current)?.focus();
    }
  }, [enabledActions, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const dismissOutside = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      didDismissSomethingWithOutsideTapJustNow();
      setIsOpen(false);
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    return () =>
      document.removeEventListener("pointerdown", dismissOutside, true);
  }, [isOpen]);

  return (
    <Container
      ref={containerRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && isOpen) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <Trigger
        ref={triggerRef}
        type="button"
        $isBlue
        aria-label="Event administration"
        title="Event administration"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!isOpen) {
              focusLastOnOpenRef.current = event.key === "ArrowUp";
            }
            setIsOpen(true);
            const items = menuRef.current?.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            );
            items?.[event.key === "ArrowUp" ? items.length - 1 : 0]?.focus();
          }
        }}
      >
        <FaEllipsisH aria-hidden="true" />
      </Trigger>
      {isOpen && (
        <Menu
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Event administration"
          onKeyDown={(event) => {
            const items = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              ),
            );
            const index = items.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            let nextIndex: number;
            if (event.key === "ArrowDown")
              nextIndex = (index + 1) % items.length;
            else if (event.key === "ArrowUp")
              nextIndex = (index - 1 + items.length) % items.length;
            else if (event.key === "Home") nextIndex = 0;
            else if (event.key === "End") nextIndex = items.length - 1;
            else return;
            event.preventDefault();
            items[nextIndex]?.focus();
          }}
        >
          {actions.map((action) => (
            <MenuItem
              key={action.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={action.disabled}
              onClick={() => {
                close();
                action.onSelect();
              }}
            >
              {action.label}
            </MenuItem>
          ))}
        </Menu>
      )}
    </Container>
  );
};
