import React, { useEffect, useState, useRef } from "react";
import styled from "styled-components";
import { resolveENS } from "../utils/ensResolver";
import { connection } from "../connection/connection";
import { showShinyCard } from "./ShinyCard";
import { PlayerProfile } from "../connection/connectionModels";
import { AvatarImage } from "./AvatarImage";
import { isLocalHost } from "../utils/localDev";

const RENDER_AND_DOWNLOAD_ALL_ID_CARDS = false;

export const LeaderboardContainer = styled.div<{ show: boolean }>`
  opacity: 1;
  height: calc(min(69dvh - 10px - env(safe-area-inset-bottom) * 0.63, 100dvh - 110pt - env(safe-area-inset-bottom) * 0.63));
  margin-top: -2px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
`;

const LeaderboardTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  color: var(--color-gray-33);
  table-layout: fixed;
  font-size: 0.85rem;

  @media (max-width: 360px) {
    font-size: 0.8rem;
  }

  @media (max-width: 320px) {
    font-size: 0.75rem;
  }

  @media (prefers-color-scheme: dark) {
    color: var(--color-gray-f5);
  }

  thead {
    position: sticky;
    top: 0;
    background-color: var(--color-white);
    z-index: 1;
    font-size: 0.93rem;

    @media (prefers-color-scheme: dark) {
      background-color: var(--color-deep-gray);
    }
  }

  th {
    padding: 0px 0 5px 0px;
    color: var(--color-gray-99);
    font-size: 0.777rem;

    @media (prefers-color-scheme: dark) {
      color: var(--color-gray-99);
    }
  }

  td {
    padding: 6px 0 6px 0px;

    @media (max-width: 360px) {
      padding: 4px 0 4px 0px;
    }
  }

  th,
  td {
    border-bottom: 1px solid var(--color-gray-dd);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    @media (prefers-color-scheme: dark) {
      border-bottom: 1px solid var(--color-gray-33);
    }

    &:nth-child(1) {
      width: 8%;
      text-align: left;
      font-size: 0.75rem;
      color: var(--color-gray-99);
      padding-left: 5px;

      @media (max-width: 320px) {
        width: 10%;
        padding-left: 3px;
      }
    }
    &:nth-child(2) {
      width: 11.5%;
      font-size: 0;
      text-align: left;
      overflow: visible;

      @media (max-width: 320px) {
        width: 13%;
      }
    }
    &:nth-child(3) {
      width: 62%;
      text-align: left;

      @media (max-width: 320px) {
        width: 57%;
      }
    }
    &:nth-child(4) {
      width: 18.5%;
      text-align: right;
      padding-right: 15px;

      @media (max-width: 360px) {
        padding-right: 10px;
      }

      @media (max-width: 320px) {
        width: 20%;
        padding-right: 5px;
      }
    }
  }

  tbody tr {
    cursor: pointer;

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: var(--leaderboardRowHoverBackground);

        @media (prefers-color-scheme: dark) {
          background-color: var(--leaderboardRowHoverBackgroundDark);
        }
      }
    }
  }
`;

const TableWrapper = styled.div`
  overflow-y: auto;
  flex: 1;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  -ms-overflow-style: none;
  &::-webkit-scrollbar {
    display: none;
  }

  overscroll-behavior: contain;
  touch-action: pan-y;
`;

const LoadingText = styled.div`
  text-align: center;
  font-size: 0.8rem;
  color: var(--color-gray-77);
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;

  @media (prefers-color-scheme: dark) {
    color: var(--leaderboardLoadingTextColorDark);
  }
`;

const RatingCell = styled.td<{ win: boolean }>`
  color: ${(props) => (props.win ? "var(--leaderboardRatingWinColor)" : "var(--leaderboardRatingLossColor)")};
  font-weight: 500;

  @media (prefers-color-scheme: dark) {
    color: ${(props) => (props.win ? "var(--leaderboardRatingWinColorDark)" : "var(--leaderboardRatingLossColorDark)")};
  }
`;

const EmojiImage = styled.div`
  width: 26px;
  height: 26px;
  vertical-align: middle;
  margin-left: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;

  @media (max-width: 360px) {
    width: 24px;
    height: 24px;
  }

  @media (max-width: 320px) {
    width: 22px;
    height: 22px;
    margin-left: 1px;
  }
`;

const EmojiPlaceholder = styled.div`
  width: 26px;
  height: 26px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
  margin-left: 2px;

  @media (max-width: 360px) {
    width: 24px;
    height: 24px;
  }

  @media (max-width: 320px) {
    width: 22px;
    height: 22px;
    margin-left: 1px;
  }

  &:after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background-color: var(--color-gray-e0);

    @media (max-width: 360px) {
      width: 16px;
      height: 16px;
    }

    @media (max-width: 320px) {
      width: 14px;
      height: 14px;
    }
  }

  @media (prefers-color-scheme: dark) {
    &:after {
      background-color: var(--color-gray-44);
    }
  }
`;

interface LeaderboardProps {
  show: boolean;
}

interface LeaderboardEntry {
  eth?: string | null;
  sol?: string | null;
  games: number;
  rating: number;
  win: boolean;
  id: string;
  emoji: number;
  aura?: string;
  ensName?: string | null;
  username?: string | null;
  profile: PlayerProfile;
}

const getLeaderboardDisplayName = (row: LeaderboardEntry): string => {
  if (row.username) return row.username;
  if (row.ensName) return row.ensName;
  if (row.eth) return row.eth.slice(0, 4) + "..." + row.eth.slice(-4);
  if (row.sol) return row.sol.slice(0, 4) + "..." + row.sol.slice(-4);
  return "";
};

const useAutoDownloadLeaderboardCards = ({ show, data }: { show: boolean; data: LeaderboardEntry[] | null }) => {
  const autoDownloadRunRef = useRef(0);
  const autoDownloadHasRunRef = useRef(false);

  useEffect(() => {
    if (!show) {
      autoDownloadRunRef.current += 1;
      autoDownloadHasRunRef.current = false;
      return;
    }
    if (!isLocalHost() || !RENDER_AND_DOWNLOAD_ALL_ID_CARDS || !data || data.length === 0 || autoDownloadHasRunRef.current) {
      return;
    }
    autoDownloadHasRunRef.current = true;
    const runId = ++autoDownloadRunRef.current;
    const run = async () => {
      for (const row of data) {
        if (autoDownloadRunRef.current !== runId) {
          return;
        }
        await showShinyCard(row.profile, getLeaderboardDisplayName(row), true, true);
      }
    };
    void run();
  }, [show, data]);
};

export const Leaderboard: React.FC<LeaderboardProps> = ({ show }) => {
  const [data, setData] = useState<LeaderboardEntry[] | null>(null);
  const [loadedEmojis, setLoadedEmojis] = useState<Set<string>>(new Set());
  const tableWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (show) {
      if (tableWrapperRef.current) {
        setTimeout(() => {
          if (tableWrapperRef.current) {
            tableWrapperRef.current.scrollTop = 0;
          }
        }, 5);
      }

      connection
        .getLeaderboard()
        .then((profiles) => {
          const leaderboardData = profiles.map((entry) => ({
            username: entry.username,
            eth: entry.eth,
            sol: entry.sol,
            games: (entry.nonce ?? -1) + 1,
            rating: Math.round(entry.rating ?? 1500),
            win: entry.win ?? true,
            id: entry.id,
            emoji: entry.emoji,
            aura: entry.aura,
            ensName: null,
            profile: entry,
          }));
          setData(leaderboardData);

          leaderboardData.forEach(async (entry, index) => {
            if (entry.eth && !entry.username) {
              const ensName = await resolveENS(entry.eth);
              if (ensName) {
                setData((prevData) => {
                  if (!prevData) return prevData;
                  const newData = [...prevData];
                  newData[index] = { ...newData[index], ensName };
                  return newData;
                });
              }
            }
          });
        })
        .catch((error) => {
          console.error("Failed to fetch leaderboard data:", error);
        });
    }
  }, [show]);

  useAutoDownloadLeaderboardCards({ show, data });

  const handleRowClick = (row: LeaderboardEntry) => {
    showShinyCard(row.profile, getLeaderboardDisplayName(row), true);
  };

  const handleEmojiLoad = (emojiKey: string) => {
    setLoadedEmojis((prev) => new Set(prev).add(emojiKey));
  };

  return (
    <LeaderboardContainer show={show}>
      {data ? (
        <TableWrapper ref={tableWrapperRef}>
          <LeaderboardTable>
            <thead>
              <tr>
                <th></th>
                <th></th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.map((row: LeaderboardEntry, index: number) => {
                const emojiUrl = emojis.getEmojiUrl(row.emoji.toString());
                const emojiKey = `${row.id}-${row.emoji}`;
                const isEmojiLoaded = loadedEmojis.has(emojiKey);

                return (
                  <tr key={index} onClick={() => handleRowClick(row)}>
                    <td>{index + 1}</td>
                    <td>
                      {!isEmojiLoaded && <EmojiPlaceholder />}
                      <EmojiImage style={{ display: isEmojiLoaded ? "flex" : "none" }}>
                        <AvatarImage src={emojiUrl} alt="" rainbowAura={!!row.aura} loading="eager" onLoad={() => handleEmojiLoad(emojiKey)} />
                      </EmojiImage>
                    </td>
                    <td>{getLeaderboardDisplayName(row)}</td>
                    <RatingCell win={row.win}>{row.rating}</RatingCell>
                  </tr>
                );
              })}
            </tbody>
          </LeaderboardTable>
        </TableWrapper>
      ) : (
        <LoadingText>UPDATING...</LoadingText>
      )}
    </LeaderboardContainer>
  );
};

const emojis = (await import("../content/emojis")).emojis;
