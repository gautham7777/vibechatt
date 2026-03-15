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
  getDocs,
  setDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Hash, Trash2, LogOut, MessageSquareDashed, Send, AlertTriangle, Copy, Check, Users, Smile, Paperclip, FileText, Image as ImageIcon, X } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';

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
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
}

interface RoomData {
  code: string;
  ownerId: string;
}

interface Participant {
  uid: string;
  name: string;
  photo: string;
  isTyping?: boolean;
}

export default function ChatRoom({ user, roomId, onLeave }: ChatRoomProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const [activeUsers, setActiveUsers] = useState<Participant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isTypingLocal, setIsTypingLocal] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatMessage = (text: string) => {
    const parts = text.split(/(\*.*?\*|_.*?_|~~.*?~~)/g);
    return parts.map((part, i) => {
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return <strong key={i} className="font-bold">{part.slice(1, -1)}</strong>;
      }
      if (part.startsWith('_') && part.endsWith('_') && part.length > 2) {
        return <em key={i} className="italic">{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('~~') && part.endsWith('~~') && part.length > 4) {
        return <del key={i} className="line-through opacity-70">{part.slice(2, -2)}</del>;
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
  };

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

    const unsubscribeParticipants = onSnapshot(collection(db, 'rooms', roomId, 'participants'), (snapshot) => {
      const users: Participant[] = [];
      snapshot.forEach((doc) => {
        users.push(doc.data() as Participant);
      });
      setActiveUsers(users);
    });

    return () => {
      unsubscribeRoom();
      unsubscribeMessages();
      unsubscribeParticipants();
    };
  }, [roomId, onLeave]);

  // Separate effect for participant tracking to update when profile changes
  useEffect(() => {
    const participantRef = doc(db, 'rooms', roomId, 'participants', user.uid);
    setDoc(participantRef, {
      uid: user.uid,
      name: user.displayName || 'Anonymous',
      photo: user.photoURL || '',
      isTyping: false
    }, { merge: true });

    const handleBeforeUnload = () => {
      deleteDoc(participantRef);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      deleteDoc(participantRef);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [roomId, user.uid, user.displayName, user.photoURL]);

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    
    if (!isTypingLocal) {
      setIsTypingLocal(true);
      const participantRef = doc(db, 'rooms', roomId, 'participants', user.uid);
      setDoc(participantRef, { isTyping: true }, { merge: true });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTypingLocal(false);
      const participantRef = doc(db, 'rooms', roomId, 'participants', user.uid);
      setDoc(participantRef, { isTyping: false }, { merge: true });
    }, 2000);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !attachment) || newMessage.length > 1000 || isUploading) return;

    const text = newMessage.trim();
    setNewMessage('');
    setIsUploading(true);
    setError(null);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    setIsTypingLocal(false);
    setDoc(doc(db, 'rooms', roomId, 'participants', user.uid), { isTyping: false }, { merge: true });

    try {
      let fileUrl = null;
      let fileName = null;
      let fileType = null;

      if (attachment) {
        const storageRef = ref(storage, `rooms/${roomId}/${Date.now()}_${attachment.name}`);
        await uploadBytes(storageRef, attachment);
        fileUrl = await getDownloadURL(storageRef);
        fileName = attachment.name;
        fileType = attachment.type;
        setAttachment(null);
      }

      await addDoc(collection(db, 'rooms', roomId, 'messages'), {
        text,
        senderId: user.uid,
        senderName: user.displayName || 'Anonymous',
        senderPhoto: user.photoURL || '',
        createdAt: serverTimestamp(),
        ...(fileUrl && { fileUrl, fileName, fileType })
      });
    } catch (err) {
      console.error('Error sending message:', err);
      setError('Failed to send message. Please try again.');
      setNewMessage(text); // Restore text on failure
    } finally {
      setIsUploading(false);
    }
  };

  const onEmojiClick = (emojiObject: any) => {
    setNewMessage(prev => prev + emojiObject.emoji);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        setError('File must be less than 10MB');
        return;
      }
      setAttachment(file);
      setShowEmojiPicker(false);
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

  const handleCopyCode = () => {
    if (roomData?.code) {
      navigator.clipboard.writeText(roomData.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const confirmDeleteMessage = async () => {
    if (!messageToDelete) return;
    setError(null);
    try {
      await deleteDoc(doc(db, 'rooms', roomId, 'messages', messageToDelete));
      setMessageToDelete(null);
    } catch (err) {
      console.error('Error deleting message:', err);
      setError('Failed to delete message. Please try again.');
      setMessageToDelete(null);
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
  const typingUsers = activeUsers.filter(p => p.isTyping && p.uid !== user.uid);

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex-1 flex flex-col pro-card rounded-2xl overflow-hidden relative pro-shadow">
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200 bg-white z-10">
        <div className="flex items-center gap-6">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900">
              <Hash className="w-6 h-6 text-brand-accent" /> Workspace
            </h2>
            <div className="text-sm text-slate-500 mt-1 flex items-center gap-2 font-medium">
              Code: 
              <div className="flex items-center bg-slate-50 rounded-md border border-slate-200 overflow-hidden">
                <span className="font-mono px-2.5 py-0.5 text-slate-900 tracking-widest">{roomData.code}</span>
                <button onClick={handleCopyCode} className="p-1.5 hover:bg-slate-200 transition-colors border-l border-slate-200 text-slate-500" title="Copy Room Code">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Active Users */}
          <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-slate-500 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
            <Users className="w-3.5 h-3.5 text-brand-accent" />
            <span>{activeUsers.length} online</span>
            <div className="flex -space-x-2 ml-1">
              {activeUsers.slice(0, 3).map(p => (
                p.photo ? 
                  <img key={p.uid} src={p.photo} className="w-6 h-6 rounded-full border-2 border-white object-cover" title={p.name} referrerPolicy="no-referrer" /> :
                  <div key={p.uid} className="w-6 h-6 rounded-full bg-gradient-to-br from-brand-accent to-indigo-500 border-2 border-white flex items-center justify-center text-[9px] text-white font-bold" title={p.name}>
                    {p.name.charAt(0).toUpperCase()}
                  </div>
              ))}
              {activeUsers.length > 3 && (
                <div className="w-6 h-6 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[9px] text-slate-600 font-bold z-10">
                  +{activeUsers.length - 3}
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {isOwner ? (
            <button
              onClick={handleCloseRoom}
              className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-all text-sm font-bold flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> <span className="hidden sm:inline">Close Room</span>
            </button>
          ) : (
            <button
              onClick={onLeave}
              className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 transition-all text-sm font-bold flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Leave</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scroll-smooth z-10 bg-slate-50/50">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
            <MessageSquareDashed className="w-16 h-16 mb-2 opacity-30" />
            <p className="font-medium text-lg">It's quiet here... send a message to start the conversation!</p>
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
                className={`flex flex-col group ${isMe ? 'items-end' : 'items-start'}`}
              >
                {showHeader && (
                  <div className={`flex items-center gap-2 mb-1.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                    {msg.senderPhoto ? (
                      <img src={msg.senderPhoto} alt="" className="w-7 h-7 rounded-full border border-slate-200 shadow-sm" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-accent to-indigo-500 flex items-center justify-center text-white text-[10px] font-bold shadow-sm">
                        {msg.senderName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-xs font-bold text-slate-500 tracking-wide">{isMe ? 'You' : msg.senderName}</span>
                  </div>
                )}
                <div className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'} max-w-[85%] sm:max-w-[75%]`}>
                  <div 
                    className={`px-5 py-3.5 rounded-2xl text-sm sm:text-base shadow-md font-medium leading-relaxed ${
                      isMe 
                        ? 'bg-gradient-to-br from-brand-accent to-indigo-500 text-white rounded-tr-sm' 
                        : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'
                    }`}
                  >
                    {msg.fileUrl && (
                      <div className={`mb-2 rounded-xl overflow-hidden border ${isMe ? 'border-white/20' : 'border-slate-200'}`}>
                        {msg.fileType?.startsWith('image/') ? (
                          <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer">
                            <img src={msg.fileUrl} alt={msg.fileName} className="max-w-full h-auto max-h-64 object-contain bg-black/5" />
                          </a>
                        ) : (
                          <a 
                            href={msg.fileUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className={`flex items-center gap-3 p-3 transition-colors ${isMe ? 'bg-black/10 hover:bg-black/20 text-white' : 'bg-slate-50 hover:bg-slate-100 text-slate-700'}`}
                          >
                            <div className={`p-2 rounded-lg ${isMe ? 'bg-white/20' : 'bg-white shadow-sm'}`}>
                              <FileText className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold truncate">{msg.fileName}</p>
                              <p className={`text-[10px] uppercase tracking-wider ${isMe ? 'text-blue-100' : 'text-slate-500'}`}>Document</p>
                            </div>
                          </a>
                        )}
                      </div>
                    )}
                    {msg.text && <div className="break-words">{formatMessage(msg.text)}</div>}
                    <div className={`text-[10px] mt-1 text-right ${isMe ? 'text-blue-200' : 'text-slate-400'}`}>
                      {formatTime(msg.createdAt)}
                    </div>
                  </div>
                  
                  {isMe && (
                    <button 
                      onClick={() => setMessageToDelete(msg.id)}
                      className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all mb-1 flex-shrink-0"
                      title="Delete message"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, height: 0, marginBottom: 0 }} 
            animate={{ opacity: 1, height: 'auto', marginBottom: 8 }} 
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="px-4 sm:px-6 z-20"
          >
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm font-semibold shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                {error}
              </div>
              <button onClick={() => setError(null)} className="hover:text-red-800 text-lg leading-none">&times;</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Typing Indicator */}
      {typingUsers.length > 0 && (
        <div className="px-6 py-2 bg-slate-50/50 text-xs text-slate-500 font-medium italic flex items-center gap-2 border-t border-slate-100">
           <div className="flex gap-1">
             <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
             <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
             <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
           </div>
           {typingUsers.map(u => u.name).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 sm:p-6 border-t border-slate-200 bg-white z-10 flex flex-col gap-2 relative">
        
        {/* Attachment Preview */}
        <AnimatePresence>
          {attachment && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute bottom-[calc(100%+10px)] left-6 bg-white border border-slate-200 shadow-lg rounded-xl p-3 flex items-center gap-3 max-w-xs z-20"
            >
              <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-brand-accent flex-shrink-0">
                {attachment.type.startsWith('image/') ? <ImageIcon className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-700 truncate">{attachment.name}</p>
                <p className="text-xs text-slate-400">{(attachment.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <button 
                onClick={() => setAttachment(null)}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Emoji Picker */}
        <AnimatePresence>
          {showEmojiPicker && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="absolute bottom-[calc(100%+10px)] left-6 z-30 shadow-2xl rounded-xl overflow-hidden border border-slate-200"
            >
              <EmojiPicker onEmojiClick={onEmojiClick} />
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSendMessage} className="flex gap-2 sm:gap-3 items-end">
          <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl flex items-center focus-within:ring-2 focus-within:ring-brand-accent/20 focus-within:border-brand-accent focus-within:bg-white transition-all">
            <button
              type="button"
              onClick={() => { setShowEmojiPicker(!showEmojiPicker); setAttachment(null); }}
              className={`p-3 sm:p-4 transition-colors ${showEmojiPicker ? 'text-brand-accent' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Smile className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3 sm:p-4 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileSelect} 
              className="hidden" 
            />
            <input
              type="text"
              value={newMessage}
              onChange={handleTyping}
              placeholder="Type your message..."
              className="flex-1 bg-transparent py-4 pr-4 focus:outline-none placeholder:text-slate-400 font-medium text-slate-800 min-w-0"
              maxLength={1000}
            />
          </div>
          <button
            type="submit"
            disabled={(!newMessage.trim() && !attachment) || newMessage.length > 1000 || isUploading}
            className="w-14 h-14 rounded-xl bg-gradient-to-r from-brand-accent to-indigo-500 hover:from-blue-700 hover:to-indigo-600 text-white pro-button disabled:opacity-50 flex items-center justify-center flex-shrink-0"
          >
            {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-1" />}
          </button>
        </form>
        <div className={`text-xs text-right font-medium pr-16 ${newMessage.length >= 1000 ? 'text-red-500' : 'text-slate-400'}`}>
          {newMessage.length}/1000
        </div>
      </div>

      {/* Confirmation Modals */}
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
              className="bg-white p-8 sm:p-10 rounded-2xl max-w-sm w-full text-center pro-shadow relative overflow-hidden border border-slate-100"
            >
              <div className="w-16 h-16 bg-red-50 rounded-xl flex items-center justify-center mx-auto mb-6">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-2xl font-bold mb-3 text-slate-900 tracking-tight">Close Workspace?</h3>
              <p className="text-slate-500 mb-8 font-medium leading-relaxed">
                This will permanently delete the workspace and all messages for everyone. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsClosing(false)}
                  className="flex-1 py-3.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmCloseRoom}
                  className="flex-1 py-3.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 transition-all font-bold text-white shadow-sm"
                >
                  Close It
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {messageToDelete && (
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
              className="bg-white p-8 sm:p-10 rounded-2xl max-w-sm w-full text-center pro-shadow relative overflow-hidden border border-slate-100"
            >
              <div className="w-16 h-16 bg-red-50 rounded-xl flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-2xl font-bold mb-3 text-slate-900 tracking-tight">Delete Message?</h3>
              <p className="text-slate-500 mb-8 font-medium leading-relaxed">
                This message will be permanently deleted for everyone in the room.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setMessageToDelete(null)}
                  className="flex-1 py-3.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteMessage}
                  className="flex-1 py-3.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 transition-all font-bold text-white shadow-sm"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
