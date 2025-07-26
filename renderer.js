// Globale Variablen für die App
let dbPath = null;
let outputDir = null;
let syncResults = {
  missingImages: [],
  removedEntries: [],
  missingEntries: [],
  missingThumbnails: []
};
let modelsData = [];
let currentLanguage = 'en'; // Standardsprache ist Englisch

// DOM-Elemente
const dbPathInput = document.getElementById('db-path');
const outputDirInput = document.getElementById('output-dir');
// Tabellennamen sind fest auf "images" gesetzt
// Bildspaltenname ist fest auf "image_name"
const syncButton = document.getElementById('sync-button');
const syncThumbnailsButton = document.getElementById('sync-thumbnails-button');
const selectDbButton = document.getElementById('select-db');
const selectOutputButton = document.getElementById('select-output');
const removeEntriesButton = document.getElementById('remove-entries');
const restoreDbEntriesButton = document.getElementById('restore-db-entries');
const restoreThumbnailsButton = document.getElementById('restore-thumbnails');
const removedEntriesList = document.getElementById('removed-entries-list');
const missingEntriesList = document.getElementById('missing-entries-list');
const missingThumbnailsList = document.getElementById('missing-thumbnails-list');
const removedCount = document.getElementById('removed-count');
const missingEntriesCount = document.getElementById('missing-entries-count');
const missingThumbnailsCount = document.getElementById('missing-thumbnails-count');
const statusBar = document.getElementById('status-bar');
const languageSelect = document.getElementById('language-select');

// Model-Management DOM-Elemente
const loadModelsButton = document.getElementById('load-models-button');
const updatePathsButton = document.getElementById('update-paths-button');
const oldPathInput = document.getElementById('old-path');
const newPathInput = document.getElementById('new-path');
const modelsList = document.getElementById('models-list');
const modelsCount = document.getElementById('models-count');

// Model-Type-Management DOM-Elemente
const updateTypesButton = document.getElementById('update-types-button');
const newTypeInput = document.getElementById('new-type');

// Feste Werte für Tabelle und Spalte
const MODELS_TABLE = 'models';
const PATH_COLUMN = 'path';

// Funktion zum Übersetzen der Benutzeroberfläche
// Mache die Funktion global verfügbar
window.translateUI = function(language) {
  currentLanguage = language;
  
  // Speichere die ausgewählte Sprache im localStorage
  localStorage.setItem('preferredLanguage', language);
  
  // Übersetze alle Elemente mit data-i18n Attribut
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    if (window.translations[language] && window.translations[language][key]) {
      element.textContent = window.translations[language][key];
    } else {
      console.log('Keine Übersetzung gefunden für:', key);
    }
  });
  
  // Übersetze Platzhalter für Eingabefelder
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    const key = element.getAttribute('data-i18n-placeholder');
    if (window.translations[language] && window.translations[language][key]) {
      element.placeholder = window.translations[language][key];
    }
  });
  
  // Aktualisiere den Dokumenttitel
  if (window.translations[language] && window.translations[language].appTitle) {
    document.title = window.translations[language].appTitle;
  }
}

// Event-Handler für Sprachauswahl
if (languageSelect) {
  languageSelect.addEventListener('change', (event) => {
    console.log('Sprache geändert zu:', event.target.value);
    translateUI(event.target.value);
  });
}

// Keine Tab-Buttons mehr, da beide Bereiche gleichzeitig angezeigt werden

// Event-Handler für Datenbankauswahl
selectDbButton.addEventListener('click', async () => {
  try {
    const selectedPath = await window.electronAPI.selectDbFile();
    if (selectedPath) {
      dbPath = selectedPath;
      dbPathInput.value = selectedPath;
      updateSyncButtonState();
    }
  } catch (error) {
    setStatus(`${error.message}`, true);
  }
});

// Event-Handler für Ausgabeverzeichnisauswahl
selectOutputButton.addEventListener('click', async () => {
  try {
    const selectedPath = await window.electronAPI.selectOutputDir();
    if (selectedPath) {
      outputDir = selectedPath;
      outputDirInput.value = selectedPath;
      updateSyncButtonState();
    }
  } catch (error) {
    setStatus(`${error.message}`, true);
  }
});

// Event-Handler für Synchronisierungsbutton
syncButton.addEventListener('click', async () => {
  try {
    setStatus(window.translations[currentLanguage].syncingStatus);
    
    // Tabellennamen sind fest auf "images" gesetzt
    const tableNames = ['images'];
    
    // Bildspaltenname ist fest auf "image_name" gesetzt
    const imageColumn = 'image_name';
    
    // Synchronisierung starten
    syncResults = await window.electronAPI.syncDatabase({
      dbPath,
      outputDir,
      tableNames: ['images'], // Fester Tabellenname
      imageColumn: 'image_name' // Fester Bildspaltenname
    });
    
    if (syncResults.error) {
      setStatus(`${syncResults.error}`, true);
      return;
    }
    
    // Ergebnisse anzeigen
    displaySyncResults();
    setStatus(window.translations[currentLanguage].syncCompleted);
    
  } catch (error) {
    setStatus(`${error.message}`, true);
  }
});

// Event-Handler für "Einträge löschen"-Button
removeEntriesButton.addEventListener('click', async () => {
  try {
    if (syncResults.removedEntries.length === 0) {
      setStatus(window.translations[currentLanguage].noEntriesToRemove, true);
      return;
    }
    
    const confirmMessage = window.translations[currentLanguage].confirmDelete.replace('{count}', syncResults.removedEntries.length);
    const confirmDelete = confirm(confirmMessage);
    if (!confirmDelete) {
      return;
    }
    
    setStatus(window.translations[currentLanguage].removingEntries);
    
    const result = await window.electronAPI.removeEntries({
      dbPath,
      removedEntries: syncResults.removedEntries
    });
    
    if (result.error) {
      setStatus(`${result.error}`, true);
      return;
    }
    
    setStatus(result.message);
    
    // Nach erfolgreichem Löschen erneut synchronisieren
    syncButton.click();
    
  } catch (error) {
    setStatus(`${error.message}`, true);
  }
});

// Event-Handler für "DB-Einträge wiederherstellen"-Button
restoreDbEntriesButton.addEventListener('click', async () => {
  try {
    if (syncResults.missingEntries.length === 0) {
      setStatus(window.translations[currentLanguage].noDbEntriesToRestore, true);
      return;
    }
    
    const confirmMessage = window.translations[currentLanguage].confirmRestoreEntries.replace('{count}', syncResults.missingEntries.length);
    const confirmRestore = confirm(confirmMessage);
    if (!confirmRestore) {
      return;
    }
    
    setStatus(translations[currentLanguage].restoringDbEntries);
    
    const result = await window.electronAPI.restoreDbEntries({
      dbPath,
      outputDir,
      imageColumn: 'image_name', // Fester Bildspaltenname
      tableNames: ['images'], // Fester Tabellenname
      missingEntries: syncResults.missingEntries
    });
    
    if (result.error) {
      setStatus(`${result.error}`, true);
      return;
    }
    
    setStatus(result.message);
    
    // Nach erfolgreicher Wiederherstellung erneut synchronisieren
    syncButton.click();
    
  } catch (error) {
    setStatus(`${error.message}`, true);
  }
});

// Event-Handler für Thumbnail-Synchronisierungsbutton
syncThumbnailsButton.addEventListener('click', async () => {
  try {
    setStatus(window.translations[currentLanguage].syncingThumbnails);
    
    // Thumbnail-Synchronisierung starten
    const thumbnailSyncResults = await window.electronAPI.syncThumbnails({
      outputDir
    });
    
    if (thumbnailSyncResults.error) {
      setStatus(`${thumbnailSyncResults.error}`, true);
      return;
    }
    
    // Ergebnisse speichern und anzeigen
    syncResults.missingThumbnails = thumbnailSyncResults.missingThumbnails || [];
    displaySyncResults();
    setStatus(window.translations[currentLanguage].syncCompleted);
    
  } catch (error) {
    setStatus(`${error.message}`, true);
  }
});

// Event-Handler für "Thumbnails wiederherstellen"-Button
restoreThumbnailsButton.addEventListener('click', async () => {
  try {
    if (!syncResults.missingThumbnails || syncResults.missingThumbnails.length === 0) {
      setStatus(window.translations[currentLanguage].noThumbnailsToRestore, true);
      return;
    }
    
    // Bestätigung einholen
    const confirmMessage = translations[currentLanguage].confirmRestoreThumbnails
      .replace('{count}', syncResults.missingThumbnails.length);
    
    const confirmRestore = confirm(confirmMessage);
    if (!confirmRestore) {
      return;
    }
    
    setStatus(translations[currentLanguage].restoringThumbnails);
    
    const result = await window.electronAPI.restoreThumbnails({
      outputDir,
      missingThumbnails: syncResults.missingThumbnails
    });
    
    if (result.error) {
      setStatus(`${result.error}`, true);
      return;
    }
    
    setStatus(result.message);
    
    // Nach erfolgreicher Wiederherstellung erneut synchronisieren
    syncThumbnailsButton.click();
    
  } catch (error) {
    setStatus(`${error.message}`, true);
  }
});

// Event-Handler für Model-Management
loadModelsButton.addEventListener('click', async () => {
  try {
    if (!dbPath) {
      setStatus(window.translations[currentLanguage].noDbSelected || 'Bitte wählen Sie zuerst eine Datenbank aus.', true);
      return;
    }
    
    setStatus(window.translations[currentLanguage].loadingModels);
    
    const result = await window.electronAPI.loadModels({
      dbPath: dbPath,
    });
    
    if (result.success) {
      modelsData = result.models;
      displayModels();
      setStatus(`${result.models.length} Models geladen.`);
    } else {
      setStatus(result.message, true);
    }
    
  } catch (error) {
    setStatus(`Fehler beim Laden der Models: ${error.message}`, true);
  }
});

updatePathsButton.addEventListener('click', async () => {
  try {
    if (!dbPath) {
      setStatus(window.translations[currentLanguage].noDbSelected || 'Bitte wählen Sie zuerst eine Datenbank aus.', true);
      return;
    }
    
    const oldPath = oldPathInput.value.trim();
    const newPath = newPathInput.value.trim();
    
    if (!oldPath) {
      setStatus(window.translations[currentLanguage].oldPathRequired, true);
      return;
    }
    
    if (!newPath) {
      setStatus(window.translations[currentLanguage].newPathRequired, true);
      return;
    }
    
    // Zähle wie viele Pfade betroffen wären
    const affectedModels = modelsData.filter(model => 
      model.path && model.path.includes(oldPath)
    );
    
    if (affectedModels.length === 0) {
      setStatus(window.translations[currentLanguage].noPathsToUpdate, true);
      return;
    }
    
    // Bestätigung anfordern
    const confirmMessage = window.translations[currentLanguage].confirmUpdatePaths
      .replace('{count}', affectedModels.length);
    
    if (!confirm(confirmMessage)) {
      return;
    }
    
    setStatus(window.translations[currentLanguage].updatingPaths);
    
    const result = await window.electronAPI.updateModelPaths({
      dbPath: dbPath,
      oldPath: oldPath,
      newPath: newPath
    });
    
    if (result.success) {
      setStatus(window.translations[currentLanguage].pathsUpdated + ` (${result.updatedCount} Pfade aktualisiert)`);
      // Models neu laden um aktualisierte Pfade anzuzeigen
      loadModelsButton.click();
    } else {
      setStatus(result.message, true);
    }
    
  } catch (error) {
    setStatus(`Fehler beim Aktualisieren der Pfade: ${error.message}`, true);
  }
});

// Event-Handler für Model-Type-Update
updateTypesButton.addEventListener('click', async () => {
  try {
    if (!dbPath) {
      setStatus(window.translations[currentLanguage].noDbSelected || 'Bitte wählen Sie zuerst eine Datenbank aus.', true);
      return;
    }
    
    const newType = newTypeInput.value.trim();
    
    if (!newType) {
      setStatus(window.translations[currentLanguage].newTypeRequired || 'Bitte geben Sie den neuen Type ein.', true);
      return;
    }
    
    // Sammle die ausgewählten Model-IDs
    const selectedModelIds = [];
    const checkboxes = document.querySelectorAll('.model-checkbox:checked');
    
    checkboxes.forEach(checkbox => {
      const index = parseInt(checkbox.id.replace('model-', ''));
      if (modelsData[index] && modelsData[index].id) {
        selectedModelIds.push(modelsData[index].id);
      }
    });
    
    if (selectedModelIds.length === 0) {
      setStatus(window.translations[currentLanguage].noModelsSelected || 'Bitte wählen Sie mindestens ein Model aus.', true);
      return;
    }
    
    // Bestätigungsdialog
    const confirmMessage = (window.translations[currentLanguage].confirmUpdateTypes || 'Möchten Sie wirklich den config-type von {count} ausgewählten Models zu "{newType}" ändern?')
      .replace('{count}', selectedModelIds.length)
      .replace('{newType}', newType);
    
    if (!confirm(confirmMessage)) {
      return;
    }
    
    setStatus(window.translations[currentLanguage].updatingTypes || 'Aktualisiere Model-Types...');
    
    const result = await window.electronAPI.updateModelTypes({
      dbPath: dbPath,
      modelIds: selectedModelIds,
      newType: newType
    });
    
    if (result.success) {
      setStatus(window.translations[currentLanguage].typesUpdated + ` (${result.updatedCount} von ${selectedModelIds.length} Models aktualisiert)`);
      // Models neu laden um aktualisierte Types anzuzeigen
      loadModelsButton.click();
    } else {
      setStatus(result.message, true);
    }
    
  } catch (error) {
    setStatus(`Fehler beim Aktualisieren der Model-Types: ${error.message}`, true);
  }
});

// Hilfsfunktion zum Anzeigen der Models
function displayModels() {
  if (!modelsData || modelsData.length === 0) {
    modelsList.innerHTML = '<div class="result-item">Keine Models gefunden.</div>';
    modelsCount.textContent = '(0)';
    updatePathsButton.disabled = true;
    return;
  }
  
  modelsList.innerHTML = '';
  modelsCount.textContent = `(${modelsData.length})`;
  updatePathsButton.disabled = false;
  
  modelsData.forEach((model, index) => {
    const modelItem = document.createElement('div');
    modelItem.className = 'model-item';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'model-checkbox';
    checkbox.id = `model-${index}`;
    checkbox.checked = true;
    
    const label = document.createElement('label');
    label.className = 'model-label';
    label.htmlFor = `model-${index}`;
    
    const modelInfo = document.createElement('div');
    modelInfo.className = 'model-info';
    
    // Extrahiere config-Type falls vorhanden
    let configType = 'Unbekannt';
    if (model.config && model.config.type) {
      configType = model.config.type;
    }
    
    modelInfo.innerHTML = `
      <strong>${model.name || 'Unbenannt'}</strong><br>
      <span>DB-Typ: ${model.type || 'Unbekannt'}</span><br>
      <span>Config-Typ: ${configType}</span><br>
      <span>Pfad: ${model.path || 'Kein Pfad'}</span>
    `;
    
    label.appendChild(modelInfo);
    modelItem.appendChild(checkbox);
    modelItem.appendChild(label);
    modelsList.appendChild(modelItem);
  });
}

// Hilfsfunktion zum Aktualisieren des Synchronisierungsbutton-Status
function updateSyncButtonState() {
  syncButton.disabled = !dbPath || !outputDir;
  syncThumbnailsButton.disabled = !dbPath || !outputDir;
  loadModelsButton.disabled = !dbPath;
  updateTypesButton.disabled = !dbPath;
}

// Hilfsfunktion zum Anzeigen der Synchronisierungsergebnisse
function displaySyncResults() {
  if (!syncResults) return;
  
  // Zu löschende Einträge anzeigen
  removedEntriesList.innerHTML = '';
  if (syncResults.removedEntries && syncResults.removedEntries.length > 0) {
    removedCount.textContent = `(${syncResults.removedEntries.length})`;
    removeEntriesButton.disabled = false;
    
    for (const item of syncResults.removedEntries) {
      const listItem = document.createElement('div');
      listItem.className = 'result-item';
      listItem.textContent = formatResultItem(item);
      removedEntriesList.appendChild(listItem);
    }
  } else {
    removedCount.textContent = '(0)';
    removeEntriesButton.disabled = true;
  }
  
  // Fehlende DB-Einträge anzeigen
  missingEntriesList.innerHTML = '';
  missingEntriesCount.textContent = `(${syncResults.missingEntries.length})`;
  
  if (syncResults.missingEntries.length > 0) {
    syncResults.missingEntries.forEach(item => {
      const element = document.createElement('div');
      element.className = 'result-item';
      let resultText = translations[currentLanguage].missingEntryFormat;
      resultText = resultText.replace('{fileName}', item.fileName);
      element.textContent = resultText;
      missingEntriesList.appendChild(element);
    });
    restoreDbEntriesButton.disabled = false;
  } else {
    const element = document.createElement('div');
    element.className = 'result-item';
    element.textContent = translations[currentLanguage].noMissingEntries;
    missingEntriesList.appendChild(element);
    restoreDbEntriesButton.disabled = true;
  }
  
  // Fehlende Thumbnails anzeigen
  missingThumbnailsList.innerHTML = '';
  missingThumbnailsCount.textContent = `(${syncResults.missingThumbnails ? syncResults.missingThumbnails.length : 0})`;
  
  if (syncResults.missingThumbnails && syncResults.missingThumbnails.length > 0) {
    syncResults.missingThumbnails.forEach(item => {
      const element = document.createElement('div');
      element.className = 'result-item';
      let resultText = translations[currentLanguage].missingEntryFormat;
      resultText = resultText.replace('{fileName}', item.fileName);
      element.textContent = resultText;
      missingThumbnailsList.appendChild(element);
    });
    restoreThumbnailsButton.disabled = false;
  } else {
    const element = document.createElement('div');
    element.className = 'result-item';
    element.textContent = translations[currentLanguage].noMissingThumbnails;
    missingThumbnailsList.appendChild(element);
    restoreThumbnailsButton.disabled = true;
  }
}

// Hilfsfunktion zum Setzen des Status
function setStatus(message, isError = false) {
  statusBar.textContent = message;
  statusBar.style.backgroundColor = isError ? '#e74c3c' : '#2c3e50';
}

// Hilfsfunktion zum Anzeigen der Models
function displayModels() {
  if (!modelsData || modelsData.length === 0) {
    modelsList.innerHTML = '<div class="result-item">Keine Models gefunden.</div>';
    modelsCount.textContent = '(0)';
    updatePathsButton.disabled = true;
    return;
  }
  
  modelsCount.textContent = `(${modelsData.length})`;
  updatePathsButton.disabled = false;
  
  modelsList.innerHTML = '';
  
  modelsData.forEach((model, index) => {
    const modelItem = document.createElement('div');
    modelItem.className = 'result-item model-item';
    
    // Erstelle Checkbox für Auswahl
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `model-${index}`;
    checkbox.className = 'model-checkbox';
    
    const label = document.createElement('label');
    label.htmlFor = `model-${index}`;
    label.className = 'model-label';
    
    // Zeige ID und Pfad
    const modelInfo = document.createElement('div');
    modelInfo.className = 'model-info';
    modelInfo.innerHTML = `
      <strong>ID:</strong> ${model.id || 'N/A'}<br>
      <strong>Pfad:</strong> ${model.path || 'N/A'}
    `;
    
    label.appendChild(modelInfo);
    modelItem.appendChild(checkbox);
    modelItem.appendChild(label);
    
    modelsList.appendChild(modelItem);
  });
}

// Hilfsfunktion zum Formatieren eines Ergebniseintrags
function formatResultItem(item) {
  let resultText = translations[currentLanguage].resultItemFormat;
  resultText = resultText.replace('{table}', item.table);
  resultText = resultText.replace('{rowId}', item.rowId);
  resultText = resultText.replace('{imagePath}', item.imagePath);
  return resultText;
}

// Funktion zum Initialisieren der App
function initializeApp() {
  console.log('App wird initialisiert');
  console.log('Verfügbare Übersetzungen:', translations);
  
  // Prüfe, ob eine bevorzugte Sprache im localStorage gespeichert ist
  const savedLanguage = localStorage.getItem('preferredLanguage');
  if (savedLanguage && (savedLanguage === 'de' || savedLanguage === 'en')) {
    currentLanguage = savedLanguage;
    if (languageSelect) {
      languageSelect.value = savedLanguage;
    }
  }
  
  // Übersetze die Benutzeroberfläche
  console.log('Aktuelle Sprache:', currentLanguage);
  translateUI(currentLanguage);
}

// Initialisiere die Benutzeroberfläche, wenn das DOM geladen ist
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  // DOMContentLoaded wurde bereits ausgelöst
  initializeApp();
}
