import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { resolveENS } from "../utils/ensResolver";
import { getLeaderboard } from "../connection/connection";

export const LeaderboardContainer = styled.div<{ show: boolean }>`
  opacity: ${(props) => (props.show ? 1 : 0)};
  height: ${(props) => (props.show ? "calc(69dvh - 10px)" : 0)};
  margin-top: ${(props) => (props.show ? "-18px" : "-6px")};
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

  ::-webkit-scrollbar {
    z-index: 2;
  }
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

interface LeaderboardProps {
  show: boolean;
}

interface LeaderboardEntry {
  player: string;
  games: number;
  rating: number;
  win: boolean;
  id: string;
  emoji: number;
  ensName?: string | null;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({ show }) => {
  const [data, setData] = useState<LeaderboardEntry[] | null>(null);

  useEffect(() => {
    if (show) {
      getLeaderboard()
        .then((ratings) => {
          const leaderboardData = ratings.map((entry) => ({
            player: entry.eth ?? "",
            games: (entry.nonce ?? -1) + 1,
            rating: Math.round(entry.rating ?? 1500),
            win: entry.win ?? true,
            id: entry.id,
            emoji: entry.emoji,
            ensName: null,
          }));
          setData(leaderboardData);

          leaderboardData.forEach(async (entry, index) => {
            const ensName = await resolveENS(entry.player);
            if (ensName) {
              setData((prevData) => {
                if (!prevData) return prevData;
                const newData = [...prevData];
                newData[index] = { ...newData[index], ensName };
                return newData;
              });
            }
          });
        })
        .catch((error) => {
          console.error("Failed to fetch leaderboard data:", error);
        });
    }
  }, [show]);

  const handleRowClick = (address: string) => {
    window.open(`https://etherscan.io/address/${address}`, "_blank", "noopener,noreferrer");
    // window.open(`https://base.easscan.org/attestation/view/${id}`, "_blank", "noopener,noreferrer");
  };

  return (
    <LeaderboardContainer show={show}>
      {data ? (
        <TableWrapper>
          <LeaderboardTable>
            <thead>
              <tr>
                <th></th>
                <th></th>
                <th>Player</th>
                <th>Rating</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row: LeaderboardEntry, index: number) => {
                const emojiData = emojis.getEmoji(row.emoji.toString());
                return (
                  <tr key={index} onClick={() => handleRowClick(row.player)}>
                    <td>{index + 1}</td>
                    <td>
                      <EmojiImage src={`data:image/webp;base64,${emojiData}`} alt="Player emoji" />
                    </td>
                    <td>{row.ensName || row.player.slice(2, 6) + "..." + row.player.slice(-4)}</td>
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
