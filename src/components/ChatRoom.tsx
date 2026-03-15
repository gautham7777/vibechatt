import React, { useState, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  doc, 
  getDoc, 
  deleteDoc, 
  getDocs 
} from 'firebase/firestore';
import { db } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Hash, Trash2, LogOut, MessageSquareDashed, Send, AlertTriangle } from 'lucide-react';

interface ChatRoomProps {
  user: User;
  roomId: string;
  onLeave: () => void;
}

interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  senderPhoto: string;
  createdAt: any;
}

interface RoomData {
  code: string;
  ownerId: string;
}

export default function ChatRoom({ user, roomId, onLeave }: ChatRoomProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fetch room data
    const fetchRoom = async () => {
      const roomRef = doc(db, 'rooms', roomId);
      const roomSnap = await getDoc(roomRef);
      if (roomSnap.exists()) {
        setRoomData(roomSnap.data() as RoomData);
      } else {
        // Room was deleted or doesn't exist
        onLeave();
      }
    };
    fetchRoom();

    // Listen to room document to detect if it's deleted
    const unsubscribeRoom = onSnapshot(doc(db, 'rooms', roomId), (doc) => {
      if (!doc.exists()) {
        onLeave();
      }
    });

    // Listen to messages
    const q = query(
      collection(db, 'rooms', roomId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribeMessages = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() } as Message);
      });
      setMessages(msgs);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });

    return () => {
      unsubscribeRoom();
      unsubscribeMessages();
    };
  }, [roomId, onLeave]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const text = newMessage.trim();
    setNewMessage('');

    try {
      await addDoc(collection(db, 'rooms', roomId, 'messages'), {
        text,
        senderId: user.uid,
        senderName: user.displayName || 'Anonymous',
        senderPhoto: user.photoURL || '',
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleCloseRoom = async () => {
    if (!roomData || roomData.ownerId !== user.uid) return;
    
    // Custom modal instead of window.confirm
    setIsClosing(true);
  };

  const confirmCloseRoom = async () => {
    try {
      // 1. Delete all messages in the subcollection
      const messagesRef = collection(db, 'rooms', roomId, 'messages');
      const messagesSnapshot = await getDocs(messagesRef);
      
      const deletePromises = messagesSnapshot.docs.map(messageDoc => 
        deleteDoc(doc(db, 'rooms', roomId, 'messages', messageDoc.id))
      );
      await Promise.all(deletePromises);

      // 2. Delete the room document
      await deleteDoc(doc(db, 'rooms', roomId));
      
      // 3. Leave the room (handled by onSnapshot listener usually, but just in case)
      onLeave();
    } catch (error) {
      console.error('Error closing room:', error);
      setIsClosing(false);
    }
  };

  if (!roomData) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
      </div>
    );
  }

  const isOwner = roomData.ownerId === user.uid;

  return (
    <div className="flex-1 flex flex-col glass-panel rounded-[2.5rem] overflow-hidden relative shadow-sophisticated">
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200/50 bg-white/50 backdrop-blur-md z-10">
        <div>
          <h2 className="text-xl font-extrabold flex items-center gap-2 text-slate-900">
            <Hash className="w-6 h-6 text-vibe-indigo" /> Vibe Room
          </h2>
          <div className="text-sm text-slate-500 mt-1 flex items-center gap-2 font-medium">
            Code: <span className="font-mono bg-slate-100 px-2.5 py-0.5 rounded-md text-vibe-deep tracking-widest border border-slate-200">{roomData.code}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {isOwner ? (
            <button
              onClick={handleCloseRoom}
              className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-all active:scale-95 text-sm font-bold flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> <span className="hidden sm:inline">Close Room</span>
            </button>
          ) : (
            <button
              onClick={onLeave}
              className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 transition-all active:scale-95 text-sm font-bold flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Leave</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scroll-smooth z-10 bg-white/30">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
            <MessageSquareDashed className="w-16 h-16 mb-2 opacity-30" />
            <p className="font-medium text-lg">It's quiet here... send a message to start the vibe!</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = msg.senderId === user.uid;
            const showHeader = index === 0 || messages[index - 1].senderId !== msg.senderId;

            return (
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", bounce: 0.4 }}
                key={msg.id} 
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                {showHeader && (
                  <div className={`flex items-center gap-2 mb-1.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                    {msg.senderPhoto ? (
                      <img src={msg.senderPhoto} alt="" className="w-7 h-7 rounded-full border border-slate-200 shadow-sm" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-vibe-indigo flex items-center justify-center text-white text-[10px] font-bold shadow-sm">
                        {msg.senderName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-xs font-bold text-slate-500 tracking-wide">{isMe ? 'You' : msg.senderName}</span>
                  </div>
                )}
                <div 
                  className={`max-w-[85%] sm:max-w-[75%] px-5 py-3.5 rounded-[1.5rem] text-sm sm:text-base shadow-sm font-medium leading-relaxed ${
                    isMe 
                      ? 'bg-vibe-indigo text-white rounded-tr-sm' 
                      : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'
                  }`}
                >
                  {msg.text}
                </div>
              </motion.div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 sm:p-6 border-t border-slate-200/50 bg-white/50 backdrop-blur-md z-10">
        <form onSubmit={handleSendMessage} className="flex gap-3">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 bg-white/80 border border-slate-200 rounded-2xl px-6 py-4 focus:outline-none focus:ring-4 focus:ring-vibe-indigo/10 focus:border-vibe-indigo/40 transition-all placeholder:text-slate-400 font-medium text-slate-800 shadow-inner-soft"
            maxLength={1000}
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="w-14 h-14 rounded-2xl bg-vibe-indigo text-white hover:bg-vibe-deep shadow-vibe-hover transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center flex-shrink-0"
          >
            <Send className="w-5 h-5 ml-1" />
          </button>
        </form>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {isClosing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", bounce: 0.4 }}
              className="bg-white p-8 sm:p-10 rounded-[2.5rem] max-w-sm w-full text-center shadow-2xl relative overflow-hidden border border-slate-100"
            >
              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-2xl font-black mb-3 text-slate-900 tracking-tight">Close Room?</h3>
              <p className="text-slate-500 mb-8 font-medium leading-relaxed">
                This will permanently delete the room and all messages for everyone. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsClosing(false)}
                  className="flex-1 py-3.5 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all font-bold active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmCloseRoom}
                  className="flex-1 py-3.5 px-4 rounded-2xl bg-red-600 hover:bg-red-700 transition-all font-bold text-white shadow-[0_10px_20px_-10px_rgba(220,38,38,0.5)] active:scale-95"
                >
                  Close It
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
