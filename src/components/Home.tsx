import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { motion } from 'motion/react';
import { Plus, LogIn, Loader2 } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';

interface HomeProps {
  user: User;
  onJoinRoom: (roomId: string) => void;
}

export default function Home({ user, onJoinRoom }: HomeProps) {
  const [joinCode, setJoinCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  const generateCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const handleCreateRoom = async () => {
    setIsCreating(true);
    setError('');
    try {
      const code = generateCode();
      const docRef = await addDoc(collection(db, 'rooms'), {
        code,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
      });
      onJoinRoom(docRef.id);
    } catch (err) {
      setError('Failed to create room. Please try again.');
      handleFirestoreError(err, OperationType.CREATE, 'rooms');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;

    setIsJoining(true);
    setError('');
    try {
      const q = query(collection(db, 'rooms'), where('code', '==', joinCode.toUpperCase()));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        setError('Room not found! Check the code and try again.');
      } else {
        onJoinRoom(querySnapshot.docs[0].id);
      }
    } catch (err) {
      setError('Failed to join room. Please try again.');
      handleFirestoreError(err, OperationType.GET, 'rooms');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="pro-card rounded-2xl pro-shadow p-10 sm:p-14 relative overflow-hidden">
      <div className="text-center mb-12 relative z-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4 tracking-tight">
          Join the <span className="bg-gradient-to-r from-brand-accent to-indigo-500 bg-clip-text text-transparent">Conversation</span>
        </h1>
        <p className="text-slate-500 font-medium text-lg">Ready to start a new workspace?</p>
      </div>

      {error && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="relative z-10 bg-red-50 border border-red-200 text-red-600 p-4 rounded-2xl mb-8 text-sm font-semibold text-center shadow-sm"
        >
          {error}
        </motion.div>
      )}

      <div className="mb-10 sm:mb-12 relative z-10">
        <button
          onClick={handleCreateRoom}
          disabled={isCreating || isJoining}
          className="w-full py-4 sm:py-5 px-6 sm:px-8 bg-gradient-to-r from-brand-accent to-indigo-500 hover:from-blue-700 hover:to-indigo-600 text-white font-bold rounded-xl pro-button flex items-center justify-center gap-3 disabled:opacity-70"
        >
          {isCreating ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <Plus className="w-6 h-6" />
          )}
          <span className="text-lg">{isCreating ? 'Creating...' : 'Create New Room'}</span>
        </button>
      </div>

      <div className="relative flex items-center mb-10 sm:mb-12 z-10">
        <div className="flex-grow organic-line"></div>
        <span className="flex-shrink mx-6 sm:mx-8 text-xs font-bold text-slate-400 tracking-[0.2em] uppercase">OR</span>
        <div className="flex-grow organic-line"></div>
      </div>

      <form onSubmit={handleJoinRoom} className="space-y-8 sm:space-y-10 relative z-10">
        <div className="space-y-4">
          <label htmlFor="code" className="block text-[11px] font-bold text-slate-500 uppercase tracking-[0.1em] text-center">
            Enter Room Code
          </label>
          <input
            id="code"
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="X7B9A2"
            className="w-full px-6 sm:px-8 py-4 sm:py-5 bg-white border border-slate-200 rounded-xl text-center text-2xl font-bold tracking-[0.2em] text-slate-900 placeholder:text-slate-300 focus:ring-2 focus:ring-brand-accent/20 focus:border-brand-accent outline-none transition-all"
            maxLength={6}
          />
        </div>
        <button
          type="submit"
          disabled={isJoining || isCreating || joinCode.length < 3}
          className="w-full py-4 sm:py-5 px-6 sm:px-8 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 font-bold rounded-xl flex items-center justify-center gap-3 transition-all duration-300 shadow-sm disabled:opacity-50"
        >
          {isJoining ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <LogIn className="w-6 h-6" />
          )}
          <span className="text-lg">{isJoining ? 'Joining...' : 'Join Room'}</span>
        </button>
      </form>
    </div>
  );
}
