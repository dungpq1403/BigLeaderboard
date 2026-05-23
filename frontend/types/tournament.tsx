// types/tournament.ts
export type Tournament = {
    id: number;
    gameId: number;
    name: string;
    formats: string[];
    startDate: string;
    endDate: string;
    maxParticipants: number;
    participantType: string;
    prize: number;
    description: string;
    imageUrl: string;
    createdBy: number;
    creator?: {
      id: number;
      username: string;
      fullName: string;
    };
  };