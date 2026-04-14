'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
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
    let unsubscribeUser: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Listen to authorized_emails to get real-time role and permissions
          const q = query(collection(db, 'authorized_emails'), where('email', '==', user.email));
          
          unsubscribeUser = onSnapshot(q, async (authSnap) => {
            let role: UserRole = 'user';
            let permissions = undefined;
            
            if (user.email === 'biolucas@gmail.com') {
              role = 'admin';
              permissions = { crm_read: true, crm_edit: true, crm_create: true, crm_delete: true };
            } else if (!authSnap.empty) {
              const authData = authSnap.docs[0].data();
              role = authData.role as UserRole;
              permissions = authData.permissions;
            } else {
              const userDoc = await getDoc(doc(db, 'users', user.uid));
              if (userDoc.exists()) {
                role = userDoc.data().role as UserRole;
                permissions = userDoc.data().permissions;
              }
            }

            const profile: UserProfile = {
              uid: user.uid,
              email: user.email || '',
              role,
              permissions
            };
            
            setUserProfile(profile);
            
            // Update users collection with latest info
            await setDoc(doc(db, 'users', user.uid), {
              uid: user.uid,
              email: user.email,
              role,
              permissions: permissions || null
            }, { merge: true });
            
            setLoading(false);
          });
        } catch (error) {
          console.error("Error fetching user profile:", error);
          setLoading(false);
        }
      } else {
        setUserProfile(null);
        setLoading(false);
        if (unsubscribeUser) unsubscribeUser();
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUser) unsubscribeUser();
    };
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
