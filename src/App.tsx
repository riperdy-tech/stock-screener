import { ScreenerDashboard } from "./components/ScreenerDashboard";
import { LanguageProvider } from "./components/LanguageContext";

function App() {
  return (
    <LanguageProvider>
      <div className="min-h-screen bg-background font-sans text-foreground">
        <ScreenerDashboard />
      </div>
    </LanguageProvider>
  );
}

export default App;
