import React, { useEffect, useState, useRef } from "react";
import styled from "styled-components";
import { resolveENS } from "../utils/ensResolver";
import { getLeaderboard } from "../connection/connection";
import { showShinyCard } from "./ShinyCard";
import { PlayerProfile } from "../connection/connectionModels";

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
  color: #333;
  table-layout: fixed;
  font-size: 0.85rem;

  @media (prefers-color-scheme: dark) {
    color: #f5f5f5;
  }

  thead {
    position: sticky;
    top: 0;
    background-color: #fff;
    z-index: 1;
    font-size: 0.93rem;

    @media (prefers-color-scheme: dark) {
      background-color: #131313;
    }
  }

  th {
    padding: 0px 0 5px 0px;
    color: #999;
    font-size: 0.777rem;

    @media (prefers-color-scheme: dark) {
      color: #999;
    }
  }

  td {
    padding: 6px 0 6px 0px;
  }

  th,
  td {
    border-bottom: 1px solid #ddd;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    @media (prefers-color-scheme: dark) {
      border-bottom: 1px solid #333;
    }

    &:nth-child(1) {
      width: 8%;
      text-align: left;
      font-size: 0.75rem;
      color: #999;
      padding-left: 5px;
    }
    &:nth-child(2) {
      width: 11.5%;
      font-size: 0;
      text-align: left;
    }
    &:nth-child(3) {
      width: 62%;
      text-align: left;
    }
    &:nth-child(4) {
      width: 18.5%;
      text-align: right;
      padding-right: 15px;
    }
  }

  tbody tr {
    cursor: pointer;

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background-color: rgba(0, 0, 0, 0.04);

        @media (prefers-color-scheme: dark) {
          background-color: rgba(255, 255, 255, 0.04);
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
  color: #777;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;

  @media (prefers-color-scheme: dark) {
    color: #afafaf;
  }
`;

const RatingCell = styled.td<{ win: boolean }>`
  color: ${(props) => (props.win ? "#43a047" : "#e53935")};
  font-weight: 500;

  @media (prefers-color-scheme: dark) {
    color: ${(props) => (props.win ? "#69f0ae" : "#ff5252")};
  }
`;

const EmojiImage = styled.img`
  width: 26px;
  height: 26px;
  vertical-align: middle;
  margin-left: 2px;
`;

const EmojiPlaceholder = styled.div`
  width: 26px;
  height: 26px;
  position: relative;
  display: inline-block;
  vertical-align: middle;
  margin-left: 2px;

  &:after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background-color: #e0e0e0;
  }

  @media (prefers-color-scheme: dark) {
    &:after {
      background-color: #444;
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
  ensName?: string | null;
  username?: string | null;
  profile: PlayerProfile;
}

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

      getLeaderboard()
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

  const getDisplayName = (row: LeaderboardEntry): string => {
    if (row.username) return row.username;
    if (row.ensName) return row.ensName;
    if (row.eth) return row.eth.slice(0, 4) + "..." + row.eth.slice(-4);
    if (row.sol) return row.sol.slice(0, 4) + "..." + row.sol.slice(-4);
    return "";
  };

  const handleRowClick = (row: LeaderboardEntry) => {
    showShinyCard(row.profile, getDisplayName(row), true);
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
                      <EmojiImage src={emojiUrl} alt="Player emoji" style={{ display: isEmojiLoaded ? "inline-block" : "none" }} onLoad={() => handleEmojiLoad(emojiKey)} />
                    </td>
                    <td>{getDisplayName(row)}</td>
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
