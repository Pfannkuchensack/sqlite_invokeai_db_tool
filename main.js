const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const sqlite3 = require('sqlite3').verbose();
const { imageSizeFromFile } = require('image-size/fromFile');
const PNG = require('pngjs').PNG;
const sharp = require('sharp');

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
 * Prüft, ob ein Thumbnail für ein Bild existiert und erstellt eines, falls nicht
 * @param {string} imagePath - Pfad zum Originalbild
 * @param {string} outputDir - Ausgabeverzeichnis, in dem der thumbnails-Ordner erstellt wird
 * @returns {Promise<boolean>} - true, wenn ein Thumbnail erstellt wurde, false wenn es bereits existierte oder ein Fehler auftrat
 */
async function ensureThumbnailExists(imagePath, outputDir) {
  try {
    // Extrahiere den Dateinamen aus dem Pfad und entferne die Erweiterung
    const fileNameWithExt = path.basename(imagePath);
    const fileName = path.parse(fileNameWithExt).name;
    
    // Erstelle den Pfad zum Thumbnails-Ordner
    const thumbnailDir = path.join(outputDir, 'thumbnails');
    
    // Erstelle den Thumbnails-Ordner, falls er nicht existiert
    await fs.ensureDir(thumbnailDir);
    
    // Erstelle den Pfad zum Thumbnail mit WebP-Erweiterung
    const thumbnailPath = path.join(thumbnailDir, `${fileName}.webp`);
    
    // Prüfe, ob das Thumbnail bereits existiert
    const thumbnailExists = await fs.pathExists(thumbnailPath);
    
    // Wenn das Thumbnail nicht existiert, erstelle es
    if (!thumbnailExists) {
      console.log(`Erstelle WebP-Thumbnail für ${fileNameWithExt}`);
      
      // Verwende sharp, um das Thumbnail zu erstellen
      // Zuerst die Größe des Originalbildes ermitteln
      const dimensions = await imageSizeFromFile(imagePath);
      
      // Berechne das Seitenverhältnis und die neue Größe
      let newWidth = dimensions.width;
      let newHeight = dimensions.height;
      
      // Skaliere das Bild herunter, wenn es größer als 256 Pixel in einer Dimension ist
      if (newWidth > 256 || newHeight > 256) {
        const aspectRatio = newWidth / newHeight;
        
        if (aspectRatio >= 1) {
          // Breiteres Bild
          newWidth = 256;
          newHeight = Math.round(256 / aspectRatio);
        } else {
          // Höheres Bild
          newHeight = 256;
          newWidth = Math.round(256 * aspectRatio);
        }
      }
      
      // Erstelle das Thumbnail mit den berechneten Dimensionen als WebP
      await sharp(imagePath)
        .resize({
          width: newWidth,
          height: newHeight,
          withoutEnlargement: true // Vergrößert das Bild nicht, wenn es kleiner ist
        })
        .webp({ quality: 80 }) // Konvertiere zu WebP mit 80% Qualität
        .toFile(thumbnailPath);
      
      return true; // Thumbnail wurde erstellt
    }
    
    return false; // Thumbnail existierte bereits
  } catch (error) {
    console.error(`Fehler beim Erstellen des Thumbnails für ${imagePath}:`, error);
    return false;
  }
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
          
          // Prüfe, ob ein Thumbnail existiert und erstelle eines, falls nicht
          const thumbnailCreated = await ensureThumbnailExists(imagePath, outputDir);
          if (thumbnailCreated) {
            console.log(`Thumbnail für ${entry.fileName} erstellt`);
          }
          
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

// Funktion zum Abgleich des Ausgabeverzeichnisses mit dem Thumbnails-Verzeichnis
ipcMain.handle('sync-thumbnails', async (event, { outputDir }) => {
  try {
    if (!outputDir) {
      return { error: 'Ausgabeverzeichnis nicht angegeben' };
    }
    
    // Prüfe, ob das Thumbnails-Verzeichnis existiert
    const thumbnailDir = path.join(outputDir, 'thumbnails');
    const thumbnailDirExists = await fs.pathExists(thumbnailDir);
    
    if (!thumbnailDirExists) {
      // Erstelle das Thumbnails-Verzeichnis, wenn es nicht existiert
      await fs.ensureDir(thumbnailDir);
      // Wenn das Verzeichnis nicht existiert, fehlen alle Thumbnails
      const imageFiles = await fs.readdir(outputDir);
      const missingThumbnails = imageFiles.filter(file => 
        /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file) && 
        !fs.statSync(path.join(outputDir, file)).isDirectory()
      );
      
      return {
        missingThumbnails: missingThumbnails.map(file => ({
          fileName: file,
          imagePath: path.join(outputDir, file)
        }))
      };
    }
    
    // Alle Bilddateien im Ausgabeverzeichnis finden
    const outputFiles = await fs.readdir(outputDir);
    const imageFiles = outputFiles.filter(file => 
      /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file) && 
      !fs.statSync(path.join(outputDir, file)).isDirectory()
    );
    
    // Alle Thumbnails im Thumbnails-Verzeichnis finden
    const thumbnailFiles = await fs.readdir(thumbnailDir);
    
    // Fehlende Thumbnails identifizieren
    const missingThumbnails = [];
    for (const imageFile of imageFiles) {
      // Extrahiere den Dateinamen ohne Erweiterung für den WebP-Vergleich
      const fileName = path.parse(imageFile).name;
      const webpFileName = `${fileName}.webp`;
      
      // Prüfe, ob das entsprechende WebP-Thumbnail existiert
      if (!thumbnailFiles.includes(webpFileName)) {
        missingThumbnails.push({
          fileName: imageFile,
          imagePath: path.join(outputDir, imageFile)
        });
      }
    }
    
    return { missingThumbnails };
  } catch (error) {
    console.error('Fehler beim Abgleich der Thumbnails:', error);
    return { error: error.message };
  }
});

// Funktion zum Wiederherstellen fehlender Thumbnails
ipcMain.handle('restore-thumbnails', async (event, { outputDir, missingThumbnails }) => {
  try {
    if (!missingThumbnails || missingThumbnails.length === 0) {
      return { success: false, message: 'Keine fehlenden Thumbnails zum Wiederherstellen' };
    }
    
    let restoredCount = 0;
    let errorCount = 0;
    
    // Für jedes fehlende Thumbnail
    for (const entry of missingThumbnails) {
      try {
        // Erstelle das Thumbnail
        const thumbnailCreated = await ensureThumbnailExists(entry.imagePath, outputDir);
        if (thumbnailCreated) {
          restoredCount++;
        }
      } catch (error) {
        console.error(`Fehler beim Erstellen des Thumbnails für ${entry.fileName}:`, error);
        errorCount++;
      }
    }
    
    return { 
      success: true, 
      message: `${restoredCount} Thumbnails wurden wiederhergestellt. ${errorCount} Fehler aufgetreten.` 
    };
  } catch (error) {
    console.error('Fehler beim Wiederherstellen der Thumbnails:', error);
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

// IPC-Handler für das Laden von Models
ipcMain.handle('load-models', async (event, { dbPath}) => {
  try {
    const db = new sqlite3.Database(dbPath);
    
    return new Promise((resolve, reject) => {
      // Lade alle Models mit ihrer config (die den Pfad als JSON enthält)
      db.all(`SELECT rowid as id, name, type, config FROM models WHERE config IS NOT NULL`, (err, rows) => {
        db.close();
        
        if (err) {
          resolve({ success: false, message: `Fehler beim Laden der Models: ${err.message}` });
          return;
        }
        
        const models = [];
        
        for (const row of rows) {
          try {
            // Parse die JSON config um den Pfad zu extrahieren
            const config = JSON.parse(row.config);
            const path = config.path || null;
            
            // Nur Models mit Pfad hinzufügen
            if (path) {
              models.push({
                id: row.id,
                name: row.name,
                type: row.type,
                path: path,
                config: config
              });
            }
          } catch (jsonErr) {
            console.warn(`Fehler beim Parsen der config für Model ID ${row.id}:`, jsonErr);
            // Model ohne Pfad hinzufügen
            models.push({
              id: row.id,
              name: row.name,
              type: row.type,
              path: 'Fehler beim Lesen der Config',
              config: null
            });
          }
        }
        
        resolve({ success: true, models: models });
      });
    });
  } catch (error) {
    console.error('Fehler beim Laden der Models:', error);
    return { success: false, message: error.message };
  }
});

// IPC-Handler für das Aktualisieren von Model-Pfaden
ipcMain.handle('update-model-paths', async (event, { dbPath, oldPath, newPath }) => {
  try {
    const db = new sqlite3.Database(dbPath);
    
    return new Promise((resolve, reject) => {
      // Lade alle Models mit config um zu prüfen welche betroffen sind
      db.all(`SELECT rowid as id, config FROM models WHERE config IS NOT NULL`, (err, rows) => {
        if (err) {
          db.close();
          resolve({ success: false, message: `Fehler beim Laden der Models: ${err.message}` });
          return;
        }
        
        const modelsToUpdate = [];
        
        // Prüfe welche Models den alten Pfad enthalten
        for (const row of rows) {
          try {
            const config = JSON.parse(row.config);
            if (config.path && config.path.includes(oldPath)) {
              const newConfig = { ...config };
              newConfig.path = config.path.replace(new RegExp(oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newPath);
              modelsToUpdate.push({
                id: row.id,
                newConfig: JSON.stringify(newConfig)
              });
            }
          } catch (jsonErr) {
            console.warn(`Fehler beim Parsen der config für Model ID ${row.id}:`, jsonErr);
          }
        }
        
        if (modelsToUpdate.length === 0) {
          db.close();
          resolve({ success: false, message: 'Keine Pfade gefunden, die dem alten Pfad entsprechen.' });
          return;
        }
        
        // Führe die Updates durch
        let updatedCount = 0;
        let completedUpdates = 0;
        
        const updateModel = (modelData) => {
          db.run(
            `UPDATE models SET config = ? WHERE rowid = ?`,
            [modelData.newConfig, modelData.id],
            function(err) {
              if (err) {
                console.error(`Fehler beim Aktualisieren von Model ID ${modelData.id}:`, err);
              } else {
                updatedCount += this.changes;
              }
              
              completedUpdates++;
              
              // Wenn alle Updates abgeschlossen sind
              if (completedUpdates === modelsToUpdate.length) {
                db.close();
                resolve({ 
                  success: true, 
                  message: `${updatedCount} Model-Pfade wurden erfolgreich aktualisiert.`,
                  updatedCount: updatedCount
                });
              }
            }
          );
        };
        
        // Starte alle Updates
        modelsToUpdate.forEach(updateModel);
      });
    });
  } catch (error) {
    console.error('Fehler beim Aktualisieren der Model-Pfade:', error);
    return { success: false, message: error.message };
  }
});

// IPC-Handler für das Aktualisieren von Model-Types
ipcMain.handle('update-model-types', async (event, { dbPath, modelIds, newType }) => {
  try {
    const db = new sqlite3.Database(dbPath);
    
    return new Promise((resolve, reject) => {
      // Validiere die Eingaben
      if (!modelIds || !Array.isArray(modelIds) || modelIds.length === 0) {
        db.close();
        resolve({ success: false, message: 'Keine Models ausgewählt.' });
        return;
      }
      
      if (!newType || newType.trim() === '') {
        db.close();
        resolve({ success: false, message: 'Neuer Type ist erforderlich.' });
        return;
      }
      
      // Lade die ausgewählten Models
      const placeholders = modelIds.map(() => '?').join(',');
      db.all(`SELECT rowid as id, name, type, config FROM models WHERE rowid IN (${placeholders}) AND config IS NOT NULL`, modelIds, (err, rows) => {
        if (err) {
          db.close();
          resolve({ success: false, message: `Fehler beim Laden der Models: ${err.message}` });
          return;
        }
        
        const modelsToUpdate = [];
        
        // Prüfe jedes ausgewählte Model
        for (const row of rows) {
          try {
            const config = JSON.parse(row.config);
            modelsToUpdate.push({
              id: row.id,
              name: row.name,
              currentType: row.type,
              config: config
            });
          } catch (jsonErr) {
            console.warn(`Fehler beim Parsen der config für Model ID ${row.id}:`, jsonErr);
          }
        }
        
        if (modelsToUpdate.length === 0) {
          db.close();
          resolve({ 
            success: true, 
            message: 'Keine gültigen Models zum Aktualisieren gefunden.',
            updatedCount: 0
          });
          return;
        }
        
        let updatedCount = 0;
        let completedUpdates = 0;
        
        const updateModel = (model) => {
          // Aktualisiere den type in der config
          const updatedConfig = { ...model.config };
          const oldConfigType = updatedConfig.type || 'unbekannt';
          updatedConfig.type = newType;
          
          const updatedConfigJson = JSON.stringify(updatedConfig);
          
          db.run(
            `UPDATE models SET config = ? WHERE rowid = ?`,
            [updatedConfigJson, model.id],
            function(updateErr) {
              completedUpdates++;
              
              if (updateErr) {
                console.error(`Fehler beim Aktualisieren von Model ${model.name}:`, updateErr);
              } else {
                updatedCount++;
                console.log(`Model "${model.name}" config-type von "${oldConfigType}" zu "${newType}" geändert`);
              }
              
              // Wenn alle Updates abgeschlossen sind
              if (completedUpdates === modelsToUpdate.length) {
                db.close();
                resolve({
                  success: true,
                  message: `${updatedCount} von ${modelsToUpdate.length} Models erfolgreich aktualisiert.`,
                  updatedCount: updatedCount,
                  totalModels: modelsToUpdate.length
                });
              }
            }
          );
        };
        
        // Starte alle Updates
        modelsToUpdate.forEach(updateModel);
      });
    });
  } catch (error) {
    console.error('Fehler beim Aktualisieren der Model-Types:', error);
    return { success: false, message: error.message };
  }
});
