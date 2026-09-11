import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Homepage } from './components/Homepage';
import { ArenaApp } from './components/ArenaApp';
import { RollupTelemetryModal } from './components/RollupTelemetryModal';
import { WalletModal } from './components/WalletModal';
import { PrivateRoomModal } from './components/PrivateRoomModal';
import { solanaWalletService, type WalletProfile } from './lib/solana';
import { multiplayerService } from './lib/multiplayer';
import { ThemeProvider } from './lib/theme';

export function AppContent() {
  const [currentView, setCurrentView] = useState<'HOMEPAGE' | 'ARENA'>('HOMEPAGE');
  const [selectedRoomId, setSelectedRoomId] = useState<string>('trench-1');
  const [activeProfile, setActiveProfile] = useState<WalletProfile | null>(solanaWalletService.getProfile());
  const [isTelemetryOpen, setIsTelemetryOpen] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isPrivateRoomModalOpen, setIsPrivateRoomModalOpen] = useState(false);

  const [pendingRoomId, setPendingRoomId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = solanaWalletService.subscribe(setActiveProfile);

    // Check if a room was provided in URL search parameters
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setSelectedRoomId(roomParam);
      multiplayerService.setRoom(roomParam);
      if (solanaWalletService.getProfile()?.isConnected) {
        setCurrentView('ARENA');
      } else {
        setPendingRoomId(roomParam);
        setIsWalletModalOpen(true);
      }
    }

    return () => unsub();
  }, []);

  // When user successfully connects wallet, auto-enter pending room if one was requested
  useEffect(() => {
    if (activeProfile?.isConnected && pendingRoomId) {
      const room = pendingRoomId;
      setPendingRoomId(null);
      setSelectedRoomId(room);
      multiplayerService.setRoom(room);
      setCurrentView('ARENA');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [activeProfile, pendingRoomId]);

  // If user disconnects wallet while in arena, redirect back to homepage
  useEffect(() => {
    if (!activeProfile?.isConnected && currentView === 'ARENA') {
      setCurrentView('HOMEPAGE');
    }
  }, [activeProfile, currentView]);

  const handleEnterArena = (roomId: string) => {
    if (!activeProfile?.isConnected) {
      setPendingRoomId(roomId);
      setIsWalletModalOpen(true);
      return;
    }
    setSelectedRoomId(roomId);
    multiplayerService.setRoom(roomId);
    setCurrentView('ARENA');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenPrivateRoom = () => {
    if (!activeProfile?.isConnected) {
      setIsWalletModalOpen(true);
      return;
    }
    setIsPrivateRoomModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-theme-main text-theme-main flex flex-col font-sans transition-colors duration-200">
      {/* Navigation Bar with Live Wallet State and Telemetry */}
      <Navbar
        currentView={currentView}
        onNavigate={(view) => {
          if (view === 'ARENA' && !activeProfile?.isConnected) {
            setIsWalletModalOpen(true);
            return;
          }
          setCurrentView(view);
        }}
        onOpenTelemetry={() => setIsTelemetryOpen(true)}
        onOpenWalletModal={() => setIsWalletModalOpen(true)}
      />

      {/* Main View Router */}
      <main className="flex-1">
        {currentView === 'HOMEPAGE' ? (
          <Homepage
            onEnterArena={handleEnterArena}
            activeProfile={activeProfile}
            onOpenWalletModal={() => setIsWalletModalOpen(true)}
            onOpenPrivateRoomModal={handleOpenPrivateRoom}
          />
        ) : (
          <ArenaApp
            roomId={selectedRoomId}
            activeProfile={activeProfile}
            onOpenWalletModal={() => setIsWalletModalOpen(true)}
            onOpenTelemetry={() => setIsTelemetryOpen(true)}
            onOpenPrivateRoomModal={() => setIsPrivateRoomModalOpen(true)}
          />
        )}
      </main>

      {/* MagicBlock Ephemeral Rollup Telemetry Modal */}
      <RollupTelemetryModal
        isOpen={isTelemetryOpen}
        onClose={() => setIsTelemetryOpen(false)}
      />

      {/* Solana Devnet Wallet Connection Modal */}
      <WalletModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
      />

      {/* Private Squad Room Creation Modal */}
      <PrivateRoomModal
        isOpen={isPrivateRoomModalOpen}
        onClose={() => setIsPrivateRoomModalOpen(false)}
        activeProfile={activeProfile}
        onEnterRoom={handleEnterArena}
      />
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
