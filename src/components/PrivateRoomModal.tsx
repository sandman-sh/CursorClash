import React, { useState } from 'react';
import { X, Lock, Copy, Check, ArrowRight, ShieldCheck, Plus } from 'lucide-react';
import { supabaseService } from '../lib/supabase';
import type { WalletProfile } from '../lib/solana';

interface PrivateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProfile: WalletProfile | null;
  onEnterRoom: (roomId: string) => void;
}

export const PrivateRoomModal: React.FC<PrivateRoomModalProps> = ({
  isOpen,
  onClose,
  activeProfile,
  onEnterRoom,
}) => {
  const [roomName, setRoomName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim()) return;

    setIsSubmitting(true);
    const roomId = 'squad-' + Math.random().toString(36).substring(2, 9);

    const success = await supabaseService.createRoom({
      id: roomId,
      name: roomName.trim(),
      is_private: true,
      passcode: passcode.trim() || undefined,
      created_by: activeProfile?.address,
    });

    setIsSubmitting(false);

    if (success) {
      setCreatedRoomId(roomId);
    } else {
      // Offline fallback
      setCreatedRoomId(roomId);
    }
  };

  const shareUrl =
    typeof window !== 'undefined' && createdRoomId
      ? `${window.location.origin}?room=${createdRoomId}`
      : '';

  const handleCopyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJoinCreatedRoom = () => {
    if (!createdRoomId) return;
    onEnterRoom(createdRoomId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 font-mono select-none animate-in fade-in duration-150">
      <div className="neo-card p-5 sm:p-7 w-full max-w-lg shadow-[10px_10px_0px_#000000]">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b-[3px] border-black pb-3 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-[#00C853] dark:bg-[#00FF66] border-2 border-black flex items-center justify-center text-black shadow-[2px_2px_0px_#000000]">
              <Lock size={18} />
            </div>
            <div>
              <h3 className="font-black text-lg text-theme-main font-sans tracking-tight">
                CREATE PRIVATE SQUAD ROOM
              </h3>
              <p className="text-[11px] text-theme-muted font-bold">
                Isolated Candlestick Canvas & Real-Time Peer Mesh
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-theme-muted hover:text-theme-main hover:bg-theme-inner border-2 border-transparent hover:border-black transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {!createdRoomId ? (
          <form onSubmit={handleCreateRoom} className="space-y-4">
            <div>
              <label className="block text-xs font-black text-theme-main mb-1.5 font-sans uppercase">
                Squad Room Name:
              </label>
              <input
                type="text"
                required
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="e.g. Alpha Trench Traders"
                className="w-full p-2.5 bg-theme-inner border-2 border-black font-mono text-sm text-theme-main font-bold outline-hidden focus:border-[#00C853] dark:focus:border-[#00FF66] shadow-[2px_2px_0px_#000000]"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-theme-main mb-1.5 font-sans uppercase">
                Passcode (Optional):
              </label>
              <input
                type="text"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Optional invite code"
                className="w-full p-2.5 bg-theme-inner border-2 border-black font-mono text-sm text-theme-main font-bold outline-hidden focus:border-[#00C853] dark:focus:border-[#00FF66] shadow-[2px_2px_0px_#000000]"
              />
              <p className="text-[10px] text-theme-muted font-bold mt-1">
                Only squad members with this link will see your room's canvas and cursors.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || !roomName.trim()}
                className="w-full neo-btn neo-btn-lg neo-btn-green py-3 flex items-center justify-center gap-2 font-black text-sm shadow-[4px_4px_0px_#000000]"
              >
                <Plus size={18} />
                <span>{isSubmitting ? 'CREATING ROOM...' : 'CREATE PRIVATE ROOM'}</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4 animate-in fade-in">
            <div className="p-3 bg-[#00C853]/15 dark:bg-[#00FF66]/15 border-2 border-black shadow-[2px_2px_0px_#000000]">
              <div className="flex items-center gap-1.5 text-xs font-black text-[#00C853] dark:text-[#00FF66] mb-1">
                <ShieldCheck size={16} />
                <span>PRIVATE ROOM READY!</span>
              </div>
              <div className="font-sans font-black text-sm text-theme-main">
                {roomName}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono font-bold text-theme-muted mb-1 uppercase">
                SHAREABLE SQUAD LINK:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 p-2 bg-theme-inner border-2 border-black font-mono text-xs text-theme-main truncate font-bold"
                />
                <button
                  onClick={handleCopyLink}
                  className="neo-btn neo-btn-sm neo-btn-green py-2 px-3 shrink-0 flex items-center gap-1 text-xs font-black"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copied ? 'COPIED' : 'COPY'}</span>
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={handleJoinCreatedRoom}
                className="w-full neo-btn neo-btn-lg neo-btn-green py-3 flex items-center justify-center gap-2 font-black text-sm shadow-[4px_4px_0px_#000000]"
              >
                <span>ENTER SQUAD ROOM NOW</span>
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
