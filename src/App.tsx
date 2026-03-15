import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, signInWithGoogle, logout } from './firebase';
import Home from './components/Home';
import ChatRoom from './components/ChatRoom';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, MessageSquare, LogOut, Users, ArrowRight } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] text-vibe-indigo">
        <Loader2 className="w-12 h-12 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen text-vibe-text font-sans flex flex-col antialiased selection:bg-vibe-indigo/20">
      <header className="w-full max-w-7xl mx-auto px-6 sm:px-8 py-8 sm:py-10 flex items-center justify-between z-10">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="bg-vibe-indigo p-2 sm:p-2.5 rounded-2xl shadow-lg -rotate-2 flex items-center justify-center">
            <MessageSquare className="w-6 h-6 text-white" fill="currentColor" />
          </div>
          <span className="text-xl sm:text-2xl font-extrabold tracking-tight text-vibe-deep">VibeChat</span>
        </div>
        {user ? (
          <div className="flex items-center gap-4 sm:gap-8">
            <div className="hidden sm:flex items-center gap-3 px-4 py-2 rounded-full bg-white/40 border border-white/60 shadow-sm">
              <div className="w-8 h-8 rounded-full bg-vibe-indigo flex items-center justify-center text-white text-xs font-bold ring-2 ring-white overflow-hidden">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  user.displayName?.charAt(0).toUpperCase() || 'U'
                )}
              </div>
              <span className="text-sm font-semibold text-slate-700">{user.displayName}</span>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-vibe-indigo transition-all duration-300 group"
            >
              <LogOut className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        ) : null}
      </header>

      <main className="flex-grow flex items-center justify-center px-4 sm:px-6 py-6 sm:py-12 relative z-10">
        <AnimatePresence mode="wait">
          {!user ? (
            <motion.div
              key="login"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={{ type: "spring", bounce: 0.4, duration: 0.8 }}
              className="w-full max-w-lg glass-panel rounded-[2.5rem] shadow-sophisticated p-10 sm:p-14 relative overflow-hidden text-center"
            >
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-100 rounded-full blur-3xl opacity-40"></div>
              <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-blue-50 rounded-full blur-3xl opacity-40"></div>
              
              <div className="relative z-10">
                <div className="w-20 h-20 mx-auto mb-8 rounded-2xl bg-vibe-indigo flex items-center justify-center shadow-vibe-hover rotate-6">
                  <Users className="w-10 h-10 text-white -rotate-6" />
                </div>
                <h1 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4 tracking-tight">
                  Welcome to <span className="text-vibe-indigo font-black tracking-tighter italic">VibeChat</span>
                </h1>
                <p className="text-slate-500 font-medium text-lg mb-10">
                  A beautiful, ephemeral space to connect.
                </p>
                <button
                  onClick={signInWithGoogle}
                  className="w-full py-4 sm:py-5 px-6 sm:px-8 bg-vibe-indigo hover:bg-vibe-deep text-white font-bold rounded-2xl shadow-vibe-hover flex items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] group"
                >
                  <span className="text-lg">Continue with Google</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </motion.div>
          ) : !currentRoomId ? (
            <motion.div
              key="home"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", bounce: 0.4, duration: 0.8 }}
              className="w-full max-w-lg"
            >
              <Home user={user} onJoinRoom={setCurrentRoomId} />
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ type: "spring", bounce: 0.3, duration: 0.6 }}
              className="w-full max-w-4xl h-[80vh] flex flex-col"
            >
              <ChatRoom user={user} roomId={currentRoomId} onLeave={() => setCurrentRoomId(null)} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {!currentRoomId && (
        <footer className="py-8 sm:py-12 text-center z-10">
          <p className="text-xs sm:text-[13px] text-slate-400 font-medium tracking-wide">
            © 2026 <span className="text-vibe-indigo font-bold">VibeChat</span> Inc. All rights reserved.
          </p>
        </footer>
      )}
    </div>
  );
}
