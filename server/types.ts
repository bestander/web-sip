export interface Room {
  id: string;
  name: string;
  participants: number;
  createdAt: number;
  lastActivity: number;
}

export interface CreateRoomRequest {
  name: string;
}
