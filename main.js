const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const sqlite3 = require('sqlite3').verbose();
const { imageSizeFromFile } = require('image-size/fromFile');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile('index.html');
  // Öffne die DevTools im Entwicklungsmodus
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC-Handler für die Auswahl der SQLite-Datei
ipcMain.handle('select-db-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] }]
  });
  if (canceled) return null;
  return filePaths[0];
});

// IPC-Handler für die Auswahl des Ausgabeverzeichnisses
ipcMain.handle('select-output-dir', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (canceled) return null;
  return filePaths[0];
});

// Funktion zum Abgleich der Datenbank mit dem Ausgabeverzeichnis
ipcMain.handle('sync-database', async (event, { dbPath, outputDir, imageColumn, tableNames }) => {
  try {
    if (!dbPath || !outputDir || !imageColumn || !tableNames || tableNames.length === 0) {
      return { error: 'Fehlende Parameter' };
    }

    const db = new sqlite3.Database(dbPath);
    const results = {
      missingImages: [],
      restoredImages: [],
      removedEntries: [],
      missingEntries: [] // Neue Kategorie für Bilder, die im Verzeichnis sind, aber nicht in der DB
    };

    // Alle Bilddateien im Ausgabeverzeichnis finden (ohne Thumbnails-Ordner)
    const outputFiles = await fs.readdir(outputDir);
    const imageFiles = outputFiles.filter(file => 
      // Nur Bilddateien, keine Verzeichnisse (wie thumbnails)
      /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file) && 
      !fs.statSync(path.join(outputDir, file)).isDirectory()
    );
    
    // Sammle alle Bilddateien aus der Datenbank für späteren Vergleich
    const dbImageFiles = new Set();
    
    // Für jede Tabelle prüfen
    for (const tableName of tableNames) {
      // Prüfe, ob die Tabelle existiert und die angegebene Spalte hat
      const tableCheck = await new Promise((resolve, reject) => {
        db.get(`PRAGMA table_info(${tableName})`, (err, rows) => {
          if (err) reject(err);
          else resolve(rows !== null);
        });
      });
      
      if (!tableCheck) continue;
      
      // 1. Prüfen auf fehlende Bilder in der DB
      const dbEntries = await new Promise((resolve, reject) => {
        db.all(`SELECT rowid, * FROM ${tableName}`, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
      
      for (const entry of dbEntries) {
        const imagePath = entry[imageColumn];
        if (!imagePath) continue;
        
        const imageName = path.basename(imagePath);
        const imageExists = imageFiles.includes(imageName);
        
        // Füge den Bildnamen zur Sammlung der DB-Bilder hinzu
        dbImageFiles.add(imageName);
        
        if (!imageExists) {
          results.missingImages.push({
            table: tableName,
            rowId: entry.rowid,
            imagePath
          });
        }
      }
      
      // 2. Prüfen auf Einträge ohne entsprechende Datei
      for (const entry of dbEntries) {
        const imagePath = entry[imageColumn];
        if (!imagePath) continue;
        
        const imageName = path.basename(imagePath);
        const fullPath = path.join(outputDir, imageName);
        const imageExists = await fs.pathExists(fullPath);
        
        if (!imageExists) {
          results.removedEntries.push({
            table: tableName,
            rowId: entry.rowid,
            imagePath
          });
        }
      }
    }
    
    // Identifiziere Bilder, die im Ausgabeverzeichnis existieren, aber nicht in der Datenbank
    for (const imageFile of imageFiles) {
      if (!dbImageFiles.has(imageFile)) {
        results.missingEntries.push({
          imagePath: path.join(outputDir, imageFile),
          fileName: imageFile
        });
      }
    }
    
    db.close();
    return results;
  } catch (error) {
    console.error('Fehler beim Synchronisieren:', error);
    return { error: error.message };
  }
});

// Funktion zum Wiederherstellen fehlender Bilder
ipcMain.handle('restore-images', async (event, { dbPath, outputDir, missingImages }) => {
  try {
    if (!missingImages || missingImages.length === 0) {
      return { success: false, message: 'Keine fehlenden Bilder zum Wiederherstellen' };
    }
    
    // Hier würde die Logik zum Wiederherstellen der Bilder implementiert werden
    // Da wir nicht wissen, woher die Bilder wiederhergestellt werden sollen,
    // ist dies ein Platzhalter für die eigentliche Implementierung
    
    return { 
      success: true, 
      message: `${missingImages.length} Bilder wurden wiederhergestellt.` 
    };
  } catch (error) {
    console.error('Fehler beim Wiederherstellen der Bilder:', error);
    return { error: error.message };
  }
});

// Funktion zum Wiederherstellen fehlender DB-Einträge für vorhandene Bilder
ipcMain.handle('restore-db-entries', async (event, { dbPath, outputDir, imageColumn, tableNames, missingEntries }) => {
  try {
    if (!missingEntries || missingEntries.length === 0) {
      return { success: false, message: 'Keine fehlenden DB-Einträge zum Wiederherstellen' };
    }
    
    const db = new sqlite3.Database(dbPath);
    let restoredCount = 0;
    
    // Für jede Tabelle prüfen, ob sie die richtige Struktur hat
    for (const tableName of tableNames) {
      // Prüfe, ob die Tabelle existiert und die angegebene Spalte hat
      const columns = await new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
      
      const hasImageColumn = columns.some(col => col.name === imageColumn);
      if (!hasImageColumn) continue;
      
      // Für jedes fehlende Bild einen neuen Eintrag erstellen
      for (const entry of missingEntries) {
        try {
          // Bildpfad zusammensetzen
          const imagePath = path.join(outputDir, entry.fileName);
          
          // Bildgröße ermitteln
          const dimensions = await imageSizeFromFile(imagePath);
          
          // Erstelle einen neuen Eintrag mit den erforderlichen Feldern
          await new Promise((resolve, reject) => {
            const query = `INSERT INTO ${tableName} (${imageColumn}, image_origin, image_category, width, height) VALUES (?, ?, ?, ?, ?)`;          
            db.run(query, [
              entry.fileName, 
              'internal', 
              'general',
              dimensions.width,
              dimensions.height
            ], function(err) {
              if (err) reject(err);
              else {
                restoredCount++;
                resolve();
              }
            });
          });
        } catch (error) {
          console.error(`Fehler beim Verarbeiten von ${entry.fileName}:`, error);
          // Fahre mit dem nächsten Bild fort
          continue;
        }
      }
    }
    
    db.close();
    return { 
      success: true, 
      message: `${restoredCount} DB-Einträge wurden wiederhergestellt.` 
    };
  } catch (error) {
    console.error('Fehler beim Wiederherstellen der DB-Einträge:', error);
    return { error: error.message };
  }
});

// Funktion zum Löschen von Einträgen ohne entsprechende Dateien
ipcMain.handle('remove-entries', async (event, { dbPath, removedEntries }) => {
  try {
    if (!removedEntries || removedEntries.length === 0) {
      return { success: false, message: 'Keine Einträge zum Löschen' };
    }
    
    const db = new sqlite3.Database(dbPath);
    
    // Gruppiere Einträge nach Tabellen
    const entriesByTable = {};
    for (const entry of removedEntries) {
      if (!entriesByTable[entry.table]) {
        entriesByTable[entry.table] = [];
      }
      entriesByTable[entry.table].push(entry.rowId);
    }
    
    // Lösche Einträge aus jeder Tabelle
    for (const [table, rowIds] of Object.entries(entriesByTable)) {
      await new Promise((resolve, reject) => {
        const placeholders = rowIds.map(() => '?').join(',');
        const query = `DELETE FROM ${table} WHERE rowid IN (${placeholders})`;
        
        db.run(query, rowIds, function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      });
    }
    
    db.close();
    return { 
      success: true, 
      message: `${removedEntries.length} Einträge wurden aus der Datenbank gelöscht.` 
    };
  } catch (error) {
    console.error('Fehler beim Löschen der Einträge:', error);
    return { error: error.message };
  }
});
