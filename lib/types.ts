export interface BaseEntity {
  id: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface User extends BaseEntity {
  email: string;
  name: string;
  avatar?: string | null;
  phone?: string | null;
  defaultCurrency?: string;
}

export interface Group extends BaseEntity {
  name: string;
  description?: string | null;
  currency?: string;
  members: GroupMember[];
  expenses: Expense[];
}

export interface GroupMember {
  id?: string;
  userId: string;
  user: Pick<User, 'id' | 'name' | 'email'>;
  role?: 'owner' | 'member';
}

export type SplitMethod = 'equal' | 'percentage' | 'exact' | 'itemized';

export interface Expense extends BaseEntity {
  amount: number;
  description: string;
  category?: string;
  date: string | Date;
  currency?: string;
  splitMethod: SplitMethod;
  notes?: string | null;
  groupId?: string | null;
  createdById: string;
  createdBy: Pick<User, 'id' | 'name' | 'email'>;
  splits: ExpenseSplit[];
  items?: ExpenseItem[];
}

export interface ExpenseSplit extends BaseEntity {
  expenseId: string;
  userId: string;
  user?: Pick<User, 'id' | 'name' | 'email'>;
  amount: number;
  percentage?: number | null;
  paidAmount?: number;
  settled?: boolean;
}

export interface ExpenseItem extends BaseEntity {
  expenseId: string;
  name: string;
  amount: number;
  sharedBy: string[]; // userIds
}

export interface Settlement extends BaseEntity {
  groupId?: string | null; // null for friend settlements
  fromUserId: string;
  toUserId: string;
  amount: number;
  currency?: string;
  settledAt: string | Date;
  fromUser?: Pick<User, 'id' | 'name' | 'email'>;
  toUser?: Pick<User, 'id' | 'name' | 'email'>;
}

export interface Friendship extends BaseEntity {
  userId: string;
  friendId: string;
  status: 'pending' | 'accepted' | 'rejected';
  acceptedAt?: string | Date | null;
  user?: Pick<User, 'id' | 'name' | 'email' | 'avatar'>;
  friend?: Pick<User, 'id' | 'name' | 'email' | 'avatar'>;
}

// Generic API response helpers
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
  details?: string;
}

// Client payloads
export interface AddExpensePayloadBase {
  description: string;
  amount: number;
  splitMethod: SplitMethod;
  groupId?: string;
  friendId?: string;
}

export type AddExpensePayload =
  | (AddExpensePayloadBase & { splitMethod: 'equal' })
  | (AddExpensePayloadBase & {
      splitMethod: 'percentage';
      customSplits: Array<{ userId: string; percentage: number }>;
    })
  | (AddExpensePayloadBase & {
      splitMethod: 'exact';
      customSplits: Array<{ userId: string; amount: number }>;
    })
  | (AddExpensePayloadBase & {
      splitMethod: 'itemized';
      items: Array<{ name: string; amount: number; sharedBy: string[] }>;
    });
