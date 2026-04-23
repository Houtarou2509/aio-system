// Shared types for AIO-System

export type Role = 'ADMIN' | 'STAFF_ADMIN' | 'STAFF' | 'GUEST';
export type AssetType = 'DESKTOP' | 'LAPTOP' | 'FURNITURE' | 'EQUIPMENT' | 'PERIPHERAL' | 'OTHER';
export type AssetStatus = 'AVAILABLE' | 'ASSIGNED' | 'MAINTENANCE' | 'RETIRED' | 'LOST';
export type BackupStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: { message: string; details?: unknown } | null;
  meta: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  } | null;
}

export interface UserDTO {
  id: string;
  username: string;
  email: string;
  role: Role;
  twoFactorEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AssetDTO {
  id: string;
  name: string;
  type: AssetType;
  manufacturer?: string;
  serialNumber?: string;
  purchasePrice?: number;
  purchaseDate?: string;
  currentValue?: number;
  status: AssetStatus;
  location?: string;
  assignedToId?: string;
  imageUrl?: string;
  depreciationRate?: number;
  salvageValue?: number;
  createdAt: string;
  updatedAt: string;
}