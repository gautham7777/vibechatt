import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, User, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth, signInWithGoogle, logout } from './firebase';
import Home from './components/Home';
import ChatRoom from './components/ChatRoom';
import ProfileModal from './components/ProfileModal';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, MessageSquare, LogOut, Users, Settings, Sun, Moon } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') as 'light' | 'dark') || 'light');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  // Email/Password Auth State
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      
      if (currentUser) {
        // Sync user to Firestore
        try {
          await setDoc(doc(db, 'users', currentUser.uid), {
            uid: currentUser.uid,
            displayName: currentUser.displayName || 'Anonymous',
            photoURL: currentUser.photoURL || null,
            email: currentUser.email,
            lastLoginAt: new Date(),
          }, { merge: true });
        } catch (err) {
          console.error('Error syncing user to Firestore:', err);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsAuthenticating(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        if (name.trim()) {
          await updateProfile(userCredential.user, {
            displayName: name.trim()
          });
          // Force a state update to reflect the new display name
          setUser({ ...userCredential.user, displayName: name.trim() } as User);
        }
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      let message = 'Authentication failed. Please try again.';
      if (error.code === 'auth/wrong-password') {
        message = 'Incorrect password.';
      } else if (error.code === 'auth/user-not-found') {
        message = 'No account found with this email.';
      } else if (error.code === 'auth/email-already-in-use') {
        message = 'Email is already in use.';
      } else if (error.code === 'auth/network-request-failed') {
        message = 'Network error. Please check your connection.';
      }
      setAuthError(message);
    } finally {
      setIsAuthenticating(false);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg text-brand-accent">
        <Loader2 className="w-12 h-12 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen text-slate-900 font-sans flex flex-col antialiased selection:bg-blue-100">
      <header className="w-full max-w-7xl mx-auto px-6 sm:px-8 py-8 sm:py-10 flex items-center justify-between z-10">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="bg-gradient-to-br from-brand-accent to-indigo-500 p-2 sm:p-2.5 rounded-xl shadow-sm flex items-center justify-center">
            <MessageSquare className="w-6 h-6 text-white" fill="currentColor" />
          </div>
          <span className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">VibeChat</span>
        </div>
        {user ? (
          <div className="flex items-center gap-4 sm:gap-8">
            <button 
              onClick={toggleTheme}
              className="p-2 rounded-full bg-white border border-slate-200 shadow-sm hover:border-brand-accent/30 transition-all text-slate-500 hover:text-brand-accent"
            >
              {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
            <button 
              onClick={() => setIsProfileModalOpen(true)}
              className="hidden sm:flex items-center gap-3 px-4 py-2 rounded-full bg-white border border-slate-200 shadow-sm hover:border-brand-accent/30 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-accent to-indigo-500 flex items-center justify-center text-white text-xs font-bold ring-2 ring-white overflow-hidden">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  user.displayName?.charAt(0).toUpperCase() || 'U'
                )}
              </div>
              <span className="text-sm font-semibold text-slate-700 group-hover:text-brand-accent transition-colors">{user.displayName || 'Anonymous'}</span>
              <Settings className="w-4 h-4 text-slate-400 group-hover:text-brand-accent transition-colors ml-1" />
            </button>
            
            {/* Mobile Profile Button */}
            <button 
              onClick={() => setIsProfileModalOpen(true)}
              className="sm:hidden w-10 h-10 rounded-full bg-gradient-to-br from-brand-accent to-indigo-500 flex items-center justify-center text-white text-sm font-bold shadow-sm"
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
              ) : (
                user.displayName?.charAt(0).toUpperCase() || 'U'
              )}
            </button>

            <button
              onClick={logout}
              className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-brand-accent transition-all duration-300 group"
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
              className="w-full max-w-lg pro-card rounded-2xl pro-shadow p-10 sm:p-14 relative overflow-hidden text-center"
            >
              <div className="relative z-10">
                <div className="w-16 h-16 mx-auto mb-8 rounded-xl bg-gradient-to-br from-brand-accent to-indigo-500 flex items-center justify-center shadow-sm">
                  <Users className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4 tracking-tight">
                  Welcome to <span className="bg-gradient-to-r from-brand-accent to-indigo-500 bg-clip-text text-transparent">VibeChat</span>
                </h1>
                <p className="text-slate-500 font-medium text-lg mb-8">
                  A professional space to connect.
                </p>

                {authError && (
                  <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-semibold mb-6 border border-red-100">
                    {authError}
                  </div>
                )}

                <form onSubmit={handleEmailAuth} className="space-y-4 mb-6 text-left">
                  {!isLogin && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Name</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your display name"
                        className="w-full px-5 py-3.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-accent/20 focus:border-brand-accent outline-none transition-all font-medium text-slate-800"
                        required={!isLogin}
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="test@example.com"
                      className="w-full px-5 py-3.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-accent/20 focus:border-brand-accent outline-none transition-all font-medium text-slate-800"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-5 py-3.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-accent/20 focus:border-brand-accent outline-none transition-all font-medium text-slate-800"
                      required
                      minLength={6}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isAuthenticating}
                    className="w-full py-4 px-6 bg-gradient-to-r from-brand-accent to-indigo-500 hover:from-blue-700 hover:to-indigo-600 text-white font-bold rounded-xl pro-button flex items-center justify-center gap-3 disabled:opacity-70 mt-2"
                  >
                    {isAuthenticating ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <span className="text-lg">{isLogin ? 'Sign In' : 'Create Account'}</span>
                    )}
                  </button>
                </form>

                <div className="flex items-center justify-center gap-2 text-sm font-medium text-slate-500 mb-6">
                  <span>{isLogin ? "Don't have an account?" : "Already have an account?"}</span>
                  <button 
                    type="button" 
                    onClick={() => { setIsLogin(!isLogin); setAuthError(''); }}
                    className="text-brand-accent font-bold hover:underline"
                  >
                    {isLogin ? 'Sign Up' : 'Sign In'}
                  </button>
                </div>

                <div className="relative flex items-center mb-6">
                  <div className="flex-grow organic-line"></div>
                  <span className="flex-shrink mx-4 text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase">OR</span>
                  <div className="flex-grow organic-line"></div>
                </div>

                <button
                  type="button"
                  onClick={signInWithGoogle}
                  className="w-full py-3.5 px-6 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold rounded-xl flex items-center justify-center gap-3 transition-all duration-300 shadow-sm"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  <span>Continue with Google</span>
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
          <p className="text-xs sm:text-[13px] text-slate-500 font-medium tracking-wide">
            © 2026 <span className="bg-gradient-to-r from-brand-accent to-indigo-500 bg-clip-text text-transparent font-bold">VibeChat</span> Inc. All rights reserved.
          </p>
        </footer>
      )}

      {user && (
        <ProfileModal 
          user={user} 
          isOpen={isProfileModalOpen} 
          onClose={() => setIsProfileModalOpen(false)} 
          onUpdate={(updatedUser) => setUser(updatedUser)}
        />
      )}
    </div>
  );
}
