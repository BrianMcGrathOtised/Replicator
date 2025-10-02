import './styles.css';
import { App } from './components/App';

// Type declarations for window.electronAPI - uses ElectronAPI interface from preload
declare global {
  interface Window {
    electronAPI: import('../preload/index').ElectronAPI;
    dataReplicatorUI: App;
  }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  
  // Make app globally accessible for backward compatibility with onclick handlers
  window.dataReplicatorUI = app;
  
  console.log('Data Replicator UI initialized with component system');
});
