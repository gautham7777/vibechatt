import React, { useState, useRef } from 'react';
import { User, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import { X, Loader2, User as UserIcon, Camera, Upload } from 'lucide-react';

interface ProfileModalProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (user: User) => void;
}

const compressImageToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 150;
        const MAX_HEIGHT = 150;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

export default function ProfileModal({ user, isOpen, onClose, onUpdate }: ProfileModalProps) {
  const [name, setName] = useState(user.displayName || '');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>(user.photoURL || '');
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        setError('Image must be less than 5MB');
        return;
      }
      setPhotoFile(file);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Display name cannot be empty.');
      return;
    }

    setIsUpdating(true);
    setError('');

    try {
      let finalPhotoUrl = user.photoURL || '';

      if (photoFile) {
        try {
          // Try Firebase Storage first
          const storageRef = ref(storage, `profiles/${user.uid}/${Date.now()}_${photoFile.name}`);
          await uploadBytes(storageRef, photoFile);
          finalPhotoUrl = await getDownloadURL(storageRef);
        } catch (storageErr) {
          console.warn('Firebase Storage upload failed, falling back to base64:', storageErr);
          // Fallback to base64 compression if storage rules block it
          finalPhotoUrl = await compressImageToBase64(photoFile);
        }
      }

      // Update Firebase Auth Profile
      await updateProfile(user, {
        displayName: name.trim(),
        photoURL: finalPhotoUrl || null,
      });

      // Update Firestore Users Collection
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        displayName: name.trim(),
        photoURL: finalPhotoUrl || null,
        email: user.email,
        updatedAt: new Date(),
      }, { merge: true });

      // Trigger state update in parent
      onUpdate({ ...user, displayName: name.trim(), photoURL: finalPhotoUrl || null } as User);
      onClose();
    } catch (err: any) {
      console.error('Error updating profile:', err);
      setError(err.message || 'Failed to update profile.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", bounce: 0.4 }}
            className="bg-white p-6 sm:p-8 rounded-2xl max-w-md w-full pro-shadow relative overflow-hidden border border-slate-100"
          >
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-brand-accent to-indigo-500 rounded-xl flex items-center justify-center text-white shadow-sm">
                <UserIcon className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Edit Profile</h2>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-semibold mb-6 border border-red-100">
                {error}
              </div>
            )}

            <form onSubmit={handleUpdate} className="space-y-6">
              <div className="flex flex-col items-center justify-center">
                <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                  <div className="w-24 h-24 rounded-full bg-slate-100 border-4 border-white shadow-md overflow-hidden flex items-center justify-center relative">
                    {photoPreview ? (
                      <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon className="w-10 h-10 text-slate-300" />
                    )}
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <div className="absolute bottom-0 right-0 bg-brand-accent text-white p-1.5 rounded-full shadow-sm border-2 border-white">
                    <Upload className="w-4 h-4" />
                  </div>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="image/*" 
                  className="hidden" 
                />
                <p className="text-xs text-slate-400 mt-3 font-medium">Click to upload a new picture</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Display Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-brand-accent/20 focus:border-brand-accent outline-none transition-all font-medium text-slate-800"
                  required
                  maxLength={30}
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-3.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="flex-1 py-3.5 px-4 rounded-xl bg-gradient-to-r from-brand-accent to-indigo-500 hover:from-blue-700 hover:to-indigo-600 transition-all font-bold text-white shadow-sm flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {isUpdating ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save Changes'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
