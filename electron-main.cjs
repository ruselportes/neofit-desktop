const { app, BrowserWindow, nativeTheme, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

// Set default to dark
nativeTheme.themeSource = 'dark';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, 'neofit.ico'),
    title: 'NeoFit Admin Dashboard',
    backgroundColor: nativeTheme.themeSource === 'dark' ? '#0a0a0c' : '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
    show: false,
  });

  // Show window when ready to avoid visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Start the embedded Express API server in both dev and prod
  try {
    require('./server/index.cjs');
    console.log('Embedded API server started.');
  } catch (err) {
    console.error('Failed to start embedded server:', err);
  }

  const isDev = !app.isPackaged;

  if (isDev) {
    // In development, load from Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    // Optionally open dev tools
    // mainWindow.webContents.openDevTools();
  } else {
    // Load the built React app
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC: renderer tells main process to switch theme
ipcMain.handle('set-native-theme', (_event, theme) => {
  nativeTheme.themeSource = theme; // 'dark' | 'light'
  if (mainWindow) {
    mainWindow.setBackgroundColor(theme === 'dark' ? '#0a0a0c' : '#f8fafc');
  }
  return nativeTheme.shouldUseDarkColors;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
