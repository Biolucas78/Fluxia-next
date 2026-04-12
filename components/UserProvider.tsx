'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { UserProfile, UserRole } from '@/lib/types';

interface UserContextType {
  userProfile: UserProfile | null;
  loading: boolean;
  viewMode: UserRole | null;
  changeViewMode: (role: UserRole | null) => void;
  effectiveRole: UserRole | undefined;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<UserRole | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('crm_view_mode') as UserRole | null;
  });

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            setUserProfile({
              uid: user.uid,
              email: user.email || '',
              role: userDoc.data().role as UserRole
            });
          } else {
            let role: UserRole = 'user';
            
            if (user.email === 'biolucas@gmail.com') {
              role = 'admin';
            } else {
              const q = query(collection(db, 'authorized_emails'), where('email', '==', user.email));
              const authSnap = await getDocs(q);
              if (!authSnap.empty) {
                role = authSnap.docs[0].data().role as UserRole;
              }
            }

            const defaultProfile: UserProfile = {
              uid: user.uid,
              email: user.email || '',
              role
            };
            setUserProfile(defaultProfile);
            
            await setDoc(doc(db, 'users', user.uid), {
              uid: user.uid,
              email: user.email,
              role: defaultProfile.role
            });
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribeAuth();
  }, []);

  const changeViewMode = (role: UserRole | null) => {
    setViewMode(role);
    if (role) {
      localStorage.setItem('crm_view_mode', role);
    } else {
      localStorage.removeItem('crm_view_mode');
    }
  };

  const effectiveRole = (userProfile?.role === 'admin' && viewMode) ? viewMode : userProfile?.role;

  return (
    <UserContext.Provider value={{ 
      userProfile, 
      loading, 
      viewMode, 
      changeViewMode,
      effectiveRole 
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUserContext() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUserContext must be used within a UserProvider');
  }
  return context;
}
