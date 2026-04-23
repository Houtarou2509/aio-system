export interface LookupValue {
  id: number;
  category: string;
  value: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LookupTabProps {
  category: string;
  values: LookupValue[];
  isLoading: boolean;
  onAdd: (value: string) => Promise<void>;
  onEdit: (id: number, value: string) => Promise<void>;
  onToggle: (id: number, isActive: boolean) => Promise<void>;
}