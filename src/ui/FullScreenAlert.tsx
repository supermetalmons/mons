import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import styled from "styled-components";
import { hideFullScreenAlert } from "../index";

interface FullScreenAlertProps {
  title: string;
  subtitle: string;
}

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: transparent;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 0;
  cursor: pointer;
  pointer-events: none;
`;

const ContentBase = styled.div`
  background-color: rgba(250, 250, 250, 0.95);
  padding: 10px;
  border-radius: 7pt;
  width: 85%;
  max-width: 320px;
  text-align: left;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  cursor: default;
  pointer-events: none;

  @media (prefers-color-scheme: dark) {
    background-color: rgba(35, 35, 35, 0.95);
    color: #f5f5f5;
  }
`;

const Content = styled(ContentBase)<{ $fixedHeight?: number }>`
  height: ${(p) => (p.$fixedHeight !== undefined ? `${p.$fixedHeight}px` : "auto")};
  pointer-events: none;
`;

const HiddenContent = styled(ContentBase)`
  position: absolute;
  visibility: hidden;
  pointer-events: none;
  z-index: -1;
`;

const sharedText = `
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.5;
  margin: 0;
  min-height: 1.5em;
`;

const Title = styled.h2`
  ${sharedText}
  font-size: 12px;
  font-weight: 500;

  @media (prefers-color-scheme: dark) {
    color: #f5f5f5;
  }
`;

const Subtitle = styled.p`
  ${sharedText}
  font-size: 1rem;
  color: #555;

  @media (prefers-color-scheme: dark) {
    color: #ccc;
  }
`;

const HiddenTail = styled.span`
  visibility: hidden;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;

type ProgressiveTextProps = {
  text: string;
  shown: number;
  as: React.ElementType;
};

const ProgressiveText: React.FC<ProgressiveTextProps> = ({ text, shown, as: Tag }) => {
  const chars = Array.from(text);
  const visible = chars.slice(0, shown).join("");
  const hidden = chars.slice(shown).join("");

  return (
    <Tag aria-label={text}>
      {visible}
      <HiddenTail aria-hidden="true">{hidden}</HiddenTail>
    </Tag>
  );
};

const FullScreenAlert: React.FC<FullScreenAlertProps> = ({ title, subtitle }) => {
  const [titleChars, setTitleChars] = useState(0);
  const [subtitleChars, setSubtitleChars] = useState(0);

  const [fixedHeight, setFixedHeight] = useState<number>();
  const measureRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = measureRef.current;
    if (!node) return;

    const update = () => setFixedHeight(node.getBoundingClientRect().height);
    update();

    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, [title, subtitle]);

  useEffect(() => {
    setTitleChars(0);
    setSubtitleChars(0);
  }, [title, subtitle]);

  useEffect(() => {
    let idx = 0;
    let timer: NodeJS.Timeout;
    const total = Array.from(title).length;

    const step = () => {
      setTitleChars(idx);
      if (idx < total) {
        const delay = title[idx] === " " ? 4 : 44;
        idx += 1;
        timer = setTimeout(step, delay);
      }
    };

    step();
    return () => clearTimeout(timer);
  }, [title]);

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    hideFullScreenAlert();
  };

  return (
    <Overlay onClick={handleClose}>
      <Content $fixedHeight={fixedHeight} onClick={(e) => e.stopPropagation()}>
        <ProgressiveText text={title} shown={titleChars} as={Title} />
        {subtitle && <ProgressiveText text={subtitle} shown={subtitleChars} as={Subtitle} />}
      </Content>

      <HiddenContent ref={measureRef}>
        <Title>{title}</Title>
        {subtitle && <Subtitle>{subtitle}</Subtitle>}
      </HiddenContent>
    </Overlay>
  );
};

export default FullScreenAlert;
