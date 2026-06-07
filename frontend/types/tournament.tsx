// types/tournament.ts
// LƯU Ý: id / gameId / createdBy / creator.id giờ là CHUỖI hash (Sqids) do backend
// trả về (vd. "x7F9aB") thay vì số tự tăng. Frontend treat như opaque string;
// không bao giờ parse thành number.
export type Tournament = {
    id: string;
    gameId: string;
    name: string;
    formats: string[];
    startDate: string;
    endDate: string;
    maxParticipants: number;
    participantType: string;
    prize: number;
    description: string;
    imageUrl: string;
    createdBy: string;
    creator?: {
      id: string;
      username: string;
      fullName: string;
    };
  };