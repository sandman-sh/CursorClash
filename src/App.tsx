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

  useEffect(() => {
    const unsub = solanaWalletService.subscribe(setActiveProfile);

    // Check if a room was provided in URL search parameters
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setSelectedRoomId(roomParam);
      multiplayerService.setRoom(roomParam);
      setCurrentView('ARENA');
    }

    return () => unsub();
  }, []);

  const handleEnterArena = (roomId: string) => {
    setSelectedRoomId(roomId);
    multiplayerService.setRoom(roomId);
    setCurrentView('ARENA');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-theme-main text-theme-main flex flex-col font-sans transition-colors duration-200">
      {/* Navigation Bar with Live Wallet State and Telemetry */}
      <Navbar
        currentView={currentView}
        onNavigate={setCurrentView}
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
            onOpenPrivateRoomModal={() => setIsPrivateRoomModalOpen(true)}
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
