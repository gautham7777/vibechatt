import React, { useState, useEffect } from 'react';
import { decryptFile } from '../utils/encryption';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Eye, Loader2, Lock, EyeOff } from 'lucide-react';

interface DecryptedMediaProps {
  fileUrl: string;
  fileName: string;
  fileType: string;
  isOneTime?: boolean;
  viewedBy?: string[];
  messageId: string;
  roomId: string;
  currentUserUid: string;
  isMe: boolean;
}

export default function DecryptedMedia({
  fileUrl, fileName, fileType, isOneTime, viewedBy = [], messageId, roomId, currentUserUid, isMe
}: DecryptedMediaProps) {
  const [mediaData, setMediaData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);

  const hasViewed = viewedBy.includes(currentUserUid);
  const canView = isMe || !isOneTime || !hasViewed;

  const handleReveal = async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const res = await fetch(fileUrl);
      const encryptedText = await res.text();
      const decryptedDataUrl = decryptFile(encryptedText);
      
      if (!decryptedDataUrl) {
        throw new Error("Decryption failed");
      }
      setMediaData(decryptedDataUrl);
      setIsRevealed(true);

      if (isOneTime && !isMe && !hasViewed) {
        // Mark as viewed
        const messageRef = doc(db, 'rooms', roomId, 'messages', messageId);
        await setDoc(messageRef, { viewedBy: [...viewedBy, currentUserUid] }, { merge: true });
        
        // Auto-hide after 10 seconds for one-time views
        setTimeout(() => {
          setMediaData(null);
          setIsRevealed(false);
        }, 10000);
      }
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  if (isOneTime && !isMe && hasViewed && !isRevealed) {
    return (
      <div className="flex items-center gap-2 p-4 bg-slate-900/5 rounded-xl border border-slate-200">
        <EyeOff className="w-5 h-5 text-slate-400" />
        <span className="text-sm font-semibold text-slate-500 italic">Viewed (One-Time Media)</span>
      </div>
    );
  }

  if (!isRevealed) {
    return (
      <button 
        onClick={handleReveal}
        disabled={loading}
        className={`relative overflow-hidden group flex items-center justify-center gap-3 p-4 transition-all w-full max-w-sm rounded-xl border ${
          isOneTime ? 'bg-gradient-to-r from-red-500/10 to-orange-500/10 border-red-500/20 hover:border-red-500/40 text-red-700' : 'bg-slate-900/5 hover:bg-slate-900/10 border-slate-200 text-slate-700'
        }`}
      >
        <div className="absolute inset-0 bg-white/40 backdrop-blur-sm z-0"></div>
        <div className="relative z-10 flex items-center gap-3">
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isOneTime ? <Eye className="w-5 h-5" /> : <Lock className="w-5 h-5" />)}
          <span className="text-sm font-bold">
            {loading ? 'Decrypting...' : isOneTime ? 'Click to view (One-Time)' : 'Click to decrypt media'}
          </span>
        </div>
      </button>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-500 p-2 bg-red-50 rounded italic border border-red-100">
        🔒 Failed to decrypt. Wrong Room Key?
      </div>
    );
  }

  if (!mediaData) return null;

  if (fileType?.startsWith('image/')) {
    return (
      <div className="relative rounded-xl overflow-hidden shadow-sm">
        <img src={mediaData} alt={fileName} className="max-w-full h-auto max-h-64 object-contain bg-black/5" />
        {isOneTime && (
          <div className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-full animate-pulse shadow-lg">
            Disappearing...
          </div>
        )}
      </div>
    );
  }

  return (
    <a 
      href={mediaData} 
      download={fileName}
      className={`flex items-center gap-3 p-3 transition-colors rounded-xl border ${isMe ? 'bg-white/10 hover:bg-white/20 border-white/20 text-white' : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'}`}
    >
      <div className={`p-2 rounded-lg ${isMe ? 'bg-black/20' : 'bg-white shadow-sm'}`}>
        <Lock className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-sm font-bold truncate">{fileName}</p>
        <p className={`text-[10px] uppercase tracking-wider ${isMe ? 'text-white/70' : 'text-slate-500'}`}>Encrypted Document</p>
      </div>
    </a>
  );
}
