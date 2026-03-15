import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
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
import { sanitizeText } from '../utils/profanityFilter';
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
  isEdited?: boolean;
  reactions?: { [emoji: string]: string[] };
  replyTo?: string;
  isSystem?: boolean;
  type?: 'join' | 'leave' | 'kick';
  urlPreview?: {
    title: string;
    description: string;
    image: string;
  };
  readBy?: string[];
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
  isMuted?: boolean;
}

export default function ChatRoom({ user, roomId, onLeave }: ChatRoomProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const [activeUsers, setActiveUsers] = useState<Participant[]>([]);
  const activeUsersRef = useRef<Participant[]>([]);

  useEffect(() => {
    activeUsersRef.current = activeUsers;
  }, [activeUsers]);

  const [error, setError] = useState<string | null>(null);
  const [isTypingLocal, setIsTypingLocal] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [urlPreview, setUrlPreview] = useState<any>(null);
  const [isFetchingPreview, setIsFetchingPreview] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unreadMessages = messages.filter(m => m.senderId !== user.uid && !m.readBy?.includes(user.uid));
    unreadMessages.forEach(async (msg) => {
      const messageRef = doc(db, 'rooms', roomId, 'messages', msg.id);
      await setDoc(messageRef, { readBy: [...(msg.readBy || []), user.uid] }, { merge: true });
    });
  }, [messages, roomId, user.uid]);

  const toggleMute = async (participant: Participant) => {
    if (!roomData || roomData.ownerId !== user.uid) return;
    const participantRef = doc(db, 'rooms', roomId, 'participants', participant.uid);
    await setDoc(participantRef, { isMuted: !participant.isMuted }, { merge: true });
  };

  const editMessage = async (messageId: string, newText: string) => {
    const messageRef = doc(db, 'rooms', roomId, 'messages', messageId);
    await setDoc(messageRef, { text: newText, isEdited: true }, { merge: true });
  };

  const deleteMessage = async (messageId: string) => {
    const messageRef = doc(db, 'rooms', roomId, 'messages', messageId);
    await deleteDoc(messageRef);
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    const messageRef = doc(db, 'rooms', roomId, 'messages', messageId);
    const message = messages.find(m => m.id === messageId);
    if (!message) return;

    const reactions = message.reactions || {};
    const users = reactions[emoji] || [];
    
    if (users.includes(user.uid)) {
      reactions[emoji] = users.filter(uid => uid !== user.uid);
      if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
      reactions[emoji] = [...users, user.uid];
    }
    
    await setDoc(messageRef, { reactions }, { merge: true });
  };

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
      try {
        const roomRef = doc(db, 'rooms', roomId);
        const roomSnap = await getDoc(roomRef);
        if (roomSnap.exists()) {
          setRoomData(roomSnap.data() as RoomData);
        } else {
          // Room was deleted or doesn't exist
          onLeave();
        }
      } catch (error) {
        console.error('Firestore Error (fetchRoom):', error);
        setError('Failed to load room. Please check your permissions.');
      }
    };
    fetchRoom();

    // Listen to room document to detect if it's deleted
    const unsubscribeRoom = onSnapshot(doc(db, 'rooms', roomId), (doc) => {
      if (!doc.exists()) {
        onLeave();
      }
    }, (error) => {
      console.error('Firestore Error (room):', error);
      setError('Failed to load room. Please check your permissions.');
    });

    if (!user) {
      console.log('ChatRoom: User not authenticated, skipping listeners');
      return () => {
        unsubscribeRoom();
      };
    }

    console.log('ChatRoom: Setting up listeners for roomId:', roomId, 'user:', user.uid);

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
    }, (error) => {
      console.error('Firestore Error (messages) for roomId:', roomId, 'error:', error);
      setError('Failed to load messages. Please check your permissions.');
    });

    const unsubscribeParticipants = onSnapshot(collection(db, 'rooms', roomId, 'allParticipants'), (snapshot) => {
      const users: Participant[] = [];
      snapshot.forEach((doc) => {
        users.push({ uid: doc.id, ...doc.data() } as Participant);
      });
      setActiveUsers(users);
    }, (error) => {
      console.error('Firestore Error (allParticipants):', error);
      setError('Failed to load participants.');
    });

    return () => {
      unsubscribeRoom();
      unsubscribeMessages();
      unsubscribeParticipants();
    };
  }, [roomId, onLeave, user]);

  // Separate effect for participant tracking to update when profile changes
  useEffect(() => {
    // Join room (persistent)
    const allParticipantRef = doc(db, 'rooms', roomId, 'allParticipants', user.uid);
    setDoc(allParticipantRef, {
      uid: user.uid,
      name: user.displayName || 'Anonymous',
      photo: user.photoURL || '',
      status: 'online',
      lastSeen: serverTimestamp(),
    }, { merge: true });

    const handleBeforeUnload = () => {
      setDoc(allParticipantRef, { status: 'offline', lastSeen: serverTimestamp() }, { merge: true });
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      setDoc(allParticipantRef, { status: 'offline', lastSeen: serverTimestamp() }, { merge: true });
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

    const text = sanitizeText(newMessage.trim());
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
        readBy: [user.uid],
        ...(fileUrl && { fileUrl, fileName, fileType }),
        replyTo: replyTo?.id || null,
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
  const mutedUserIds = new Set(activeUsers.filter(p => p.isMuted).map(p => p.uid));
  const filteredMessages = messages.filter(msg => !mutedUserIds.has(msg.senderId));

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
            <span>{activeUsers.filter(p => p.status === 'online').length} online</span>
            <div className="flex -space-x-2 ml-1">
              {activeUsers.map(p => (
                <div key={p.uid} className="relative group">
                  <div className={`relative ${p.status === 'offline' ? 'opacity-50 grayscale' : ''}`}>
                    {p.photo ? 
                      <img src={p.photo} className="w-6 h-6 rounded-full border-2 border-white object-cover" title={p.name} referrerPolicy="no-referrer" /> :
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-brand-accent to-indigo-500 border-2 border-white flex items-center justify-center text-[9px] text-white font-bold" title={p.name}>
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                    }
                    <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${p.status === 'online' ? 'bg-green-500' : 'bg-slate-400'}`} />
                  </div>
                  {isOwner && p.uid !== user.uid && (
                    <button 
                      onClick={() => {
                        if (confirm(`Kick ${p.name}?`)) {
                          deleteDoc(doc(db, 'rooms', roomId, 'participants', p.uid));
                        }
                      }}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Kick user"
                    >
                      X
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const chatLog = messages.map(m => `[${new Date(m.createdAt?.seconds * 1000).toLocaleTimeString()}] ${m.senderName}: ${m.text}`).join('\n');
                const blob = new Blob([chatLog], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `chat_${roomId}.txt`;
                a.click();
              }}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all"
              title="Export Chat"
            >
              <FileText className="w-4 h-4" />
            </button>
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
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scroll-smooth z-10 bg-slate-50/50">
        {filteredMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
            <MessageSquareDashed className="w-16 h-16 mb-2 opacity-30" />
            <p className="font-medium text-lg">It's quiet here... send a message to start the conversation!</p>
          </div>
        ) : (
          filteredMessages.map((msg, index) => {
            const isMe = msg.senderId === user.uid;
            const showHeader = index === 0 || filteredMessages[index - 1].senderId !== msg.senderId;

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
                    className={`px-5 py-3.5 rounded-2xl text-sm sm:text-base shadow-md font-medium leading-relaxed group relative ${
                      isMe 
                        ? 'bg-gradient-to-br from-brand-accent to-indigo-500 text-white rounded-tr-sm' 
                        : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'
                    }`}
                  >
                    {/* Message Actions */}
                    <div className={`absolute -top-10 ${isMe ? 'left-0' : 'right-0'} opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white p-1 rounded-full shadow-lg border border-slate-100`}>
                      {isMe && (
                        <>
                          <button onClick={() => { const newText = prompt('Edit message:', msg.text); if (newText) editMessage(msg.id, newText); }} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 hover:text-brand-accent">
                            <FileText className="w-4 h-4" />
                          </button>
                          <button onClick={() => deleteMessage(msg.id)} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 hover:text-red-500">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <button onClick={() => toggleReaction(msg.id, '👍')} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 hover:text-brand-accent">👍</button>
                      <button onClick={() => toggleReaction(msg.id, '❤️')} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 hover:text-red-500">❤️</button>
                    </div>

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
                    {msg.text && <div className="break-words">{formatMessage(msg.text)} {msg.isEdited && <span className="text-[10px] opacity-70">(edited)</span>}</div>}
                    
                    {/* Reactions */}
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {Object.entries(msg.reactions).map(([emoji, users]) => (
                          <div key={emoji} className="bg-white/20 rounded-full px-2 py-0.5 text-xs flex items-center gap-1">
                            {emoji} {(users as string[]).length}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <div className={`text-[10px] mt-1 text-right flex items-center justify-end gap-1 ${isMe ? 'text-blue-200' : 'text-slate-400'}`}>
                      {formatTime(msg.createdAt)}
                      {isMe && (
                        <Check className={`w-3 h-3 ${msg.readBy && msg.readBy.length > 1 ? 'text-emerald-300' : 'text-slate-300'}`} />
                      )}
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
