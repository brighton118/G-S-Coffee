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
    role: 'staff',
    isAdmin: false,
    isManager: false,
    isStaff: true,
    canEdit: false,
    userEmail: '',
    userName: ''
});

export const useUserRole = (): UserRoleContextType => useContext(UserRoleContext);

