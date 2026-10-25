import React from 'react';
import { useCurrentUser } from './AuthGate';
import { signOut } from './session';

export const AccountChip: React.FC = () => {
  const user = useCurrentUser();
  return (
    <div className="flex items-center gap-2 text-[11px] text-slate-300">
      {user.image && <img src={user.image} alt="" referrerPolicy="no-referrer" className="size-7 rounded-full border border-slate-700" />}
      <span className="max-w-32 sm:max-w-56 truncate" title={user.email}>{user.name || user.email}</span>
      <span className={`px-1.5 py-0.5 rounded border ${user.role === 'admin' ? 'border-amber-500/40 text-amber-200' : 'border-slate-700 text-slate-400'}`}>{user.role}</span>
      <button type="button" onClick={() => void signOut()} className="min-h-9 px-2.5 py-1.5 rounded-md border border-slate-700 font-medium hover:bg-slate-800">Sign out</button>
    </div>
  );
};
