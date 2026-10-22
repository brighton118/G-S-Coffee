import { createContext, useContext } from 'react';

export type UserRole = 'admin' | 'manager' | 'staff';

export interface UserRoleContextType {
    role: UserRole;
    isAdmin: boolean;
    isManager: boolean;
    isStaff: boolean;
    canEdit: boolean; // true for admin and manager, false for staff
    userEmail: string;
    userName?: string;
}

export const UserRoleContext = createContext<UserRoleContextType>({
    role: 'admin',
    isAdmin: true,
    isManager: false,
    isStaff: false,
    canEdit: true,
    userEmail: '',
    userName: ''
});

export const useUserRole = (): UserRoleContextType => useContext(UserRoleContext);

