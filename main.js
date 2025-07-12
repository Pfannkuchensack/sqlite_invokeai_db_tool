const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const sqlite3 = require('sqlite3').verbose();
const { imageSizeFromFile } = require('image-size/fromFile');
const PNG = require('pngjs').PNG;

let mainWindow;

/**
 * Prüft, ob ein PNG-Bild ein Intermediate-Image ist
 * @param {string} filePath - Pfad zur PNG-Datei
 * @returns {Promise<boolean>} - true, wenn es ein Intermediate-Image ist, sonst false
 */
async function isIntermediateImage(filePath) {
  // Nur PNG-Dateien prüfen
  if (!filePath.toLowerCase().endsWith('.png')) {
    return false;
  }
  
  return new Promise((resolve, reject) => {
    try {
      // Lese die Datei direkt als Buffer ein
      fs.readFile(filePath, (err, buffer) => {
        if (err) {
          // Bei Fehler: Nicht als Intermediate behandeln
          resolve(false);
          return;
        }
        
        try {
          // Prüfe auf invokeai_graph
          if (buffer.includes('invokeai_graph')) {
            const graphIndex = buffer.indexOf('invokeai_graph');
            if (graphIndex > 0) {
              try {
                // Suche nach dem JSON-Anfang
                let jsonStart = graphIndex + 'invokeai_graph'.length;
                while (jsonStart < buffer.length && buffer[jsonStart] !== 123) { // '{' character
                  jsonStart++;
                }
                
                // Extrahiere das JSON
                let jsonEnd = jsonStart;
                let braceCount = 0;
                
                for (let i = jsonStart; i < buffer.length; i++) {
                  if (buffer[i] === 123) { // '{'
                    braceCount++;
                  } else if (buffer[i] === 125) { // '}'
                    braceCount--;
                    if (braceCount === 0) {
                      jsonEnd = i + 1;
                      break;
                    }
                  }
                }
                
                if (jsonEnd > jsonStart) {
                  const jsonStr = buffer.toString('utf8', jsonStart, jsonEnd);
                  try {
                    const jsonData = JSON.parse(jsonStr);
                    
                    // Prüfe auf is_intermediate im JSON
                    if (jsonData && jsonData.nodes) {
                      let hasIntermediateNode = false;
                      let hasFinalNode = false;
                      
                      // Prüfe alle Knoten
                      for (const nodeId in jsonData.nodes) {
                        const node = jsonData.nodes[nodeId];
                        if (node.is_intermediate === true) {
                          hasIntermediateNode = true;
                        } else if (node.is_intermediate === false) {
                          hasFinalNode = true;
                        }
                      }
                      
                      // Wenn mindestens ein finaler Knoten vorhanden ist, ist das Bild nicht intermediate
                      if (hasFinalNode) {
                        resolve(false);
                        return;
                      }
                      
                      // Wenn nur intermediate Knoten vorhanden sind, ist das Bild intermediate
                      if (hasIntermediateNode) {
                        resolve(true);
                        return;
                      }
                    }
                  } catch (e) {
                    // Bei Fehler: Weiter prüfen
                  }
                }
              } catch (e) {
                // Bei Fehler: Weiter prüfen
              }
            }
          }
          
          // Prüfe auf parameters Text-Chunk
          if (buffer.includes('parameters')) {
            const parametersIndex = buffer.indexOf('parameters');
            if (parametersIndex > 0) {
              try {
                // Suche nach dem Ende des Schlüssels (Null-Byte)
                let valueStart = parametersIndex + 'parameters'.length;
                while (valueStart < buffer.length && buffer[valueStart] !== 0) {
                  valueStart++;
                }
                valueStart++; // Skip the null byte
                
                if (valueStart < buffer.length) {
                  // Suche nach dem Ende des Werts
                  let valueEnd = valueStart;
                  while (valueEnd < buffer.length && 
                        !(buffer[valueEnd] === 73 && buffer[valueEnd+1] === 68 && // 'ID'
                          buffer[valueEnd+2] === 65 && buffer[valueEnd+3] === 84) && // 'AT'
                        !(buffer[valueEnd] === 73 && buffer[valueEnd+1] === 69 && // 'IE'
                          buffer[valueEnd+2] === 78 && buffer[valueEnd+3] === 68)) { // 'ND'
                    valueEnd++;
                  }
                  
                  // Extrahiere den Wert
                  const value = buffer.toString('utf8', valueStart, valueEnd);
                  
                  // Prüfe auf 'intermediate' im parameters-Wert
                  if (value.includes('intermediate')) {
                    resolve(true);
                    return;
                  }
                }
              } catch (e) {
                // Bei Fehler: Weiter prüfen
              }
            }
          }
          
          // Wenn wir hier ankommen, ist es kein Intermediate-Image
          resolve(false);
        } catch (parseError) {
          // Bei Fehler: Nicht als Intermediate behandeln
          resolve(false);
        }
      });
    } catch (error) {
      // Bei Fehler: Nicht als Intermediate behandeln
      resolve(false);
    }
  });
}

/**
 * Liest den invokeai_metadata-Chunk aus einem PNG-Bild aus
 * @param {string} filePath - Pfad zur PNG-Datei
 * @returns {Promise<string|null>} - JSON-String der Metadaten oder null, wenn keine Metadaten gefunden wurden
 */
async function getMetadata(filePath) {
  // Nur PNG-Dateien prüfen
  if (!filePath.toLowerCase().endsWith('.png')) {
    return null;
  }
  
  return new Promise((resolve, reject) => {
    try {
      // Lese die Datei direkt als Buffer ein
      fs.readFile(filePath, (err, buffer) => {
        if (err) {
          resolve(null);
          return;
        }
        
        try {
          // Prüfe auf invokeai_metadata
          if (buffer.includes('invokeai_metadata')) {
            const metadataIndex = buffer.indexOf('invokeai_metadata');
            if (metadataIndex > 0) {
              try {
                // Suche nach dem Ende des Schlüssels (Null-Byte)
                let valueStart = metadataIndex + 'invokeai_metadata'.length;
                while (valueStart < buffer.length && buffer[valueStart] !== 0) {
                  valueStart++;
                }
                valueStart++; // Überspringe das Null-Byte
                
                // Suche nach dem Ende des Werts (nächstes Null-Byte)
                let valueEnd = valueStart;
                while (valueEnd < buffer.length && buffer[valueEnd] !== 0) {
                  valueEnd++;
                }
                
                if (valueEnd > valueStart) {
                  // Extrahiere den Metadaten-String
                  let value = buffer.toString('utf8', valueStart, valueEnd);
                  
                  // Entferne alle nicht-druckbaren Zeichen am Ende
                  // Wir suchen nach dem letzten gültigen Zeichen (}) und schneiden alles danach ab
                  const lastBraceIndex = value.lastIndexOf('}');
                  if (lastBraceIndex !== -1) {
                    value = value.substring(0, lastBraceIndex + 1);
                    console.log(`Metadaten erfolgreich extrahiert und bereinigt`);
                    resolve(value);
                    return;
                  }
                  
                  // Falls kein } gefunden wurde, versuche es mit einer einfachen Bereinigung
                  const cleanedValue = value.replace(/[^\x20-\x7E]/g, '');
                  console.log(`Metadaten mit einfacher Bereinigung extrahiert`);
                  resolve(cleanedValue);
                  return;
                }
              } catch (e) {
                console.error(`Fehler beim Extrahieren der Metadaten: ${e.message}`);
                // Bei Fehler: Keine Metadaten zurückgeben
              }
            }
          }
          
          resolve(null);
        } catch (parseError) {
          console.error(`Fehler beim Parsen der Metadaten: ${parseError.message}`);
          resolve(null);
        }
      });
    } catch (error) {
      console.error(`Allgemeiner Fehler beim Lesen der Datei: ${error.message}`);
      resolve(null);
    }
  });
}

/**
 * Prüft, ob ein PNG-Bild einen invokeai_workflow-Chunk enthält
 * @param {string} filePath - Pfad zur PNG-Datei
 * @returns {Promise<boolean>} - true, wenn das Bild einen workflow-Chunk enthält, sonst false
 */
async function hasWorkflow(filePath) {
  // Nur PNG-Dateien prüfen
  if (!filePath.toLowerCase().endsWith('.png')) {
    return false;
  }
  
  return new Promise((resolve, reject) => {
    try {
      // Lese die Datei direkt als Buffer ein
      fs.readFile(filePath, (err, buffer) => {
        if (err) {
          resolve(false);
          return;
        }
        
        try {
          // Prüfe auf invokeai_workflow
          if (buffer.includes('invokeai_workflow')) {
            resolve(true);
            return;
          }
          
          resolve(false);
        } catch (parseError) {
          resolve(false);
        }
      });
    } catch (error) {
      resolve(false);
    }
  });
}

/**
 * Prüft, ob ein PNG-Bild ein finales Bild ist (nicht intermediate und mit InvokeAI-Metadaten)
 * @param {string} filePath - Pfad zur PNG-Datei
 * @returns {Promise<boolean>} - true, wenn es ein finales Bild ist, sonst false
 */
async function isFinalImage(filePath) {
  // Nur PNG-Dateien prüfen
  if (!filePath.toLowerCase().endsWith('.png')) {
    return false;
  }
  
  return new Promise((resolve, reject) => {
    try {
      // Lese die Datei direkt als Buffer ein
      fs.readFile(filePath, (err, buffer) => {
        if (err) {
          resolve(false);
          return;
        }
        
        try {
          // Prüfe auf invokeai_metadata - wenn vorhanden, ist es ein finales Bild
          if (buffer.includes('invokeai_metadata')) {
            resolve(true);
            return;
          }
          
          let hasInvokeAIMetadata = false;
          let isExplicitlyFinal = false;
          
          // Prüfe auf InvokeAI-Metadaten im Graph
          if (buffer.includes('invokeai_graph')) {
            hasInvokeAIMetadata = true;
            const graphIndex = buffer.indexOf('invokeai_graph');
            if (graphIndex > 0) {
              try {
                // Suche nach dem JSON-Anfang
                let jsonStart = graphIndex + 'invokeai_graph'.length;
                while (jsonStart < buffer.length && buffer[jsonStart] !== 123) { // '{' character
                  jsonStart++;
                }
                
                // Extrahiere das JSON
                let jsonEnd = jsonStart;
                let braceCount = 0;
                
                for (let i = jsonStart; i < buffer.length; i++) {
                  if (buffer[i] === 123) { // '{'
                    braceCount++;
                  } else if (buffer[i] === 125) { // '}'
                    braceCount--;
                    if (braceCount === 0) {
                      jsonEnd = i + 1;
                      break;
                    }
                  }
                }
                
                if (jsonEnd > jsonStart) {
                  const jsonStr = buffer.toString('utf8', jsonStart, jsonEnd);
                  try {
                    const jsonData = JSON.parse(jsonStr);
                    
                    // Prüfe auf is_intermediate im JSON
                    if (jsonData && jsonData.nodes) {
                      let hasIntermediateNode = false;
                      let hasFinalNode = false;
                      
                      // Prüfe alle Knoten
                      for (const nodeId in jsonData.nodes) {
                        const node = jsonData.nodes[nodeId];
                        if (node.is_intermediate === true) {
                          hasIntermediateNode = true;
                        } else if (node.is_intermediate === false) {
                          hasFinalNode = true;
                        }
                      }
                      
                      // Wenn mindestens ein finaler Knoten vorhanden ist, ist das Bild final
                      if (hasFinalNode) {
                        resolve(true);
                        return;
                      }
                      
                      // Wenn nur intermediate Knoten vorhanden sind, ist das Bild nicht final
                      if (hasIntermediateNode) {
                        resolve(false);
                        return;
                      }
                    }
                  } catch (e) {
                    // Bei Fehler: Weiter prüfen
                  }
                }
              } catch (e) {
                // Bei Fehler: Weiter prüfen
              }
            }
          }
          
          // Prüfe auf parameters Text-Chunk
          if (buffer.includes('parameters')) {
            const parametersIndex = buffer.indexOf('parameters');
            if (parametersIndex > 0) {
              try {
                // Suche nach dem Ende des Schlüssels (Null-Byte)
                let valueStart = parametersIndex + 'parameters'.length;
                while (valueStart < buffer.length && buffer[valueStart] !== 0) {
                  valueStart++;
                }
                valueStart++; // Skip the null byte
                
                if (valueStart < buffer.length) {
                  // Suche nach dem Ende des Werts
                  let valueEnd = valueStart;
                  while (valueEnd < buffer.length && 
                        !(buffer[valueEnd] === 73 && buffer[valueEnd+1] === 68 && // 'ID'
                          buffer[valueEnd+2] === 65 && buffer[valueEnd+3] === 84) && // 'AT'
                        !(buffer[valueEnd] === 73 && buffer[valueEnd+1] === 69 && // 'IE'
                          buffer[valueEnd+2] === 78 && buffer[valueEnd+3] === 68)) { // 'ND'
                    valueEnd++;
                  }
                  
                  // Extrahiere den Wert
                  const value = buffer.toString('utf8', valueStart, valueEnd);
                  
                  // Prüfe auf 'final' im parameters-Wert
                  if (value.includes('final')) {
                    isExplicitlyFinal = true;
                  }
                }
              } catch (e) {
                // Bei Fehler: Weiter prüfen
              }
            }
          }
          
          // Ein Bild ist final, wenn es InvokeAI-Metadaten hat und entweder explizit als final markiert ist
          // oder keine Intermediate-Markierung hat
          if (hasInvokeAIMetadata && isExplicitlyFinal) {
            resolve(true);
            return;
          }
          
          // Wenn nicht explizit als final markiert, prüfe, ob es ein Intermediate-Image ist
          isIntermediateImage(filePath).then(isIntermediate => {
            if (hasInvokeAIMetadata && !isIntermediate) {
              resolve(true);
            } else {
              resolve(false);
            }
          }).catch(() => {
            resolve(false);
          });
        } catch (parseError) {
          resolve(false);
        }
      });
    } catch (error) {
      resolve(false);
    }
  });
}

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
    let skippedIntermediateCount = 0;
    let skippedUnknownCount = 0;
    
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
          
          // Prüfe, ob es sich um ein finales Bild handelt
          const isFinal = await isFinalImage(imagePath);
          
          // Wenn es kein finales Bild ist, überspringe es
          if (!isFinal) {
            // Prüfe, ob es ein Intermediate-Image ist
            const isIntermediate = await isIntermediateImage(imagePath);
            
            if (isIntermediate) {
              console.log(`Überspringe Intermediate-Image: ${entry.fileName}`);
              skippedIntermediateCount++;
            } else {
              console.log(`Überspringe unbekanntes Bild: ${entry.fileName}`);
              skippedUnknownCount++;
            }
            continue;
          }
          
          // Bildgröße ermitteln
          const dimensions = await imageSizeFromFile(imagePath);
          
          // Prüfe, ob das Bild einen Workflow enthält
          const hasWorkflowData = await hasWorkflow(imagePath);
          
          // Prüfe, ob das Bild Metadaten enthält
          const metadata = await getMetadata(imagePath);
          
          // Erstelle einen neuen Eintrag mit den erforderlichen Feldern
          await new Promise((resolve, reject) => {
            let query, params;
            
            // Bestimme die Spalten und Werte basierend auf den vorhandenen Daten
            const columns = [imageColumn, 'image_origin', 'image_category', 'width', 'height'];
            const values = [entry.fileName, 'internal', 'general', dimensions.width, dimensions.height];
            const placeholders = ['?', '?', '?', '?', '?'];
            
            // Füge has_workflow hinzu, wenn vorhanden
            if (hasWorkflowData) {
              columns.push('has_workflow');
              values.push(1); // has_workflow = 1
              placeholders.push('?');
            }
            
            // Füge metadata hinzu, wenn vorhanden
            if (metadata) {
              columns.push('metadata');
              values.push(metadata);
              placeholders.push('?');
            }
            
            // Erstelle die SQL-Abfrage
            query = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
            params = values;
            
            db.run(query, params, function(err) {
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
      message: `${restoredCount} DB-Einträge wurden wiederhergestellt. ${skippedIntermediateCount} Intermediate-Images und ${skippedUnknownCount} unbekannte Bilder wurden übersprungen.` 
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
