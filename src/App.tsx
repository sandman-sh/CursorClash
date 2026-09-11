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

function getInitialRoom(): string {
  if (typeof window !== 'undefined') {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const fromSearch =
        searchParams.get('room') ||
        searchParams.get('Room') ||
        searchParams.get('roomId') ||
        searchParams.get('r');
      if (fromSearch) return fromSearch.trim().replace(/\/+$/, '').toLowerCase();

      if (window.location.hash) {
        const hashStr = window.location.hash.replace(/^[#/?&]+/, '');
        const hashParams = new URLSearchParams(hashStr);
        const fromHash =
          hashParams.get('room') ||
          hashParams.get('Room') ||
          hashParams.get('roomId') ||
          hashParams.get('r');
        if (fromHash) return fromHash.trim().replace(/\/+$/, '').toLowerCase();
        if (hashStr.toLowerCase().startsWith('squad-') || hashStr.toLowerCase().startsWith('trench-')) {
          return hashStr.trim().replace(/\/+$/, '').toLowerCase();
        }
      }
    } catch {
      // ignore
    }
  }
  return 'trench-1';
}

function getInitialView(): 'HOMEPAGE' | 'ARENA' {
  if (typeof window !== 'undefined') {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      if (
        searchParams.has('room') ||
        searchParams.has('Room') ||
        searchParams.has('roomId') ||
        searchParams.has('r')
      ) {
        return 'ARENA';
      }
      if (window.location.hash) {
        const h = window.location.hash.toLowerCase();
        if (h.includes('room=') || h.includes('squad-') || h.includes('trench-')) {
          return 'ARENA';
        }
      }
    } catch {
      // ignore
    }
  }
  return 'HOMEPAGE';
}

export function AppContent() {
  const [currentView, setCurrentView] = useState<'HOMEPAGE' | 'ARENA'>(getInitialView);
  const [selectedRoomId, setSelectedRoomId] = useState<string>(getInitialRoom);
  const [activeProfile, setActiveProfile] = useState<WalletProfile | null>(solanaWalletService.getProfile());
  const [isTelemetryOpen, setIsTelemetryOpen] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isPrivateRoomModalOpen, setIsPrivateRoomModalOpen] = useState(false);

  const [pendingRoomId, setPendingRoomId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = solanaWalletService.subscribe(setActiveProfile);

    // Check if a room was provided in URL search parameters or hash
    const syncFromUrl = () => {
      const initialRoom = getInitialRoom();
      const hasRoomInUrl = typeof window !== 'undefined' && (
        new URLSearchParams(window.location.search).has('room') ||
        new URLSearchParams(window.location.search).has('Room') ||
        new URLSearchParams(window.location.search).has('roomId') ||
        new URLSearchParams(window.location.search).has('r') ||
        window.location.hash.includes('room=') ||
        window.location.hash.includes('squad-')
      );

      if (hasRoomInUrl && initialRoom) {
        setSelectedRoomId(initialRoom);
        multiplayerService.setRoom(initialRoom);
        setCurrentView('ARENA');

        // Keep browser address bar in sync for seamless sharing
        try {
          const u = new URL(window.location.href);
          u.searchParams.set('room', initialRoom);
          u.hash = '';
          window.history.replaceState(null, '', u.toString());
        } catch {
          // ignore history state errors
        }

        if (!solanaWalletService.getProfile()?.isConnected) {
          setPendingRoomId(initialRoom);
          setIsWalletModalOpen(true);
        }
      }
    };

    syncFromUrl();

    window.addEventListener('popstate', syncFromUrl);
    window.addEventListener('hashchange', syncFromUrl);

    return () => {
      unsub();
      window.removeEventListener('popstate', syncFromUrl);
      window.removeEventListener('hashchange', syncFromUrl);
    };
  }, []);

  // When user successfully connects wallet, auto-enter pending room if one was requested
  useEffect(() => {
    if (activeProfile?.isConnected && pendingRoomId) {
      const room = pendingRoomId;
      setPendingRoomId(null);
      setSelectedRoomId(room);
      multiplayerService.setRoom(room);
      setCurrentView('ARENA');

      try {
        const u = new URL(window.location.href);
        u.searchParams.set('room', room);
        u.hash = '';
        window.history.replaceState(null, '', u.toString());
      } catch {
        // ignore
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [activeProfile, pendingRoomId]);

  const handleEnterArena = (roomId: string) => {
    const cleanRoom = (roomId || 'trench-1').trim().replace(/\/+$/, '').toLowerCase();
    if (!activeProfile?.isConnected) {
      setPendingRoomId(cleanRoom);
      setIsWalletModalOpen(true);
      return;
    }
    setSelectedRoomId(cleanRoom);
    multiplayerService.setRoom(cleanRoom);
    setCurrentView('ARENA');

    try {
      const u = new URL(window.location.href);
      u.searchParams.set('room', cleanRoom);
      u.hash = '';
      window.history.replaceState(null, '', u.toString());
    } catch {
      window.history.replaceState(null, '', `${window.location.origin}${window.location.pathname}?room=${cleanRoom}`);
    }

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
          if (view === 'HOMEPAGE') {
            try {
              window.history.replaceState(null, '', window.location.pathname);
            } catch {
              // ignore
            }
          }
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
            onNavigateHomepage={() => {
              setCurrentView('HOMEPAGE');
              try {
                window.history.replaceState(null, '', window.location.pathname);
              } catch {
                // ignore
              }
            }}
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
