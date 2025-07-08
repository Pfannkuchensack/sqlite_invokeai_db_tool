// Übersetzungen für die App
const translationsjs = {
  de: {
    // Allgemein
    appTitle: 'Tool für InvokeAI DB',
    ready: 'Bereit',
    
    // Setup-Bereich
    dbLabel: 'InvokeAI DB:',
    outputDirLabel: 'Output Verzeichnis:',
    selectButton: 'Auswählen',
    syncButton: 'InvokeAI DB synchronisieren',
    
    // Tabs
    missingImagesTab: 'Fehlende Bilder',
    removedEntriesTab: 'Zu löschende Einträge',
    missingEntriesTab: 'Fehlende DB-Einträge',
    
    // Ergebnisse
    missingImagesTitle: 'Fehlende Bilder',
    removedEntriesTitle: 'Zu löschende Einträge',
    missingEntriesTitle: 'Fehlende DB-Einträge',
    restoreImagesButton: 'Bilder wiederherstellen',
    removeEntriesButton: 'Einträge löschen',
    restoreDbEntriesButton: 'DB-Einträge wiederherstellen',
    noMissingImages: 'Keine fehlenden Bilder gefunden.',
    noRemovedEntries: 'Keine zu löschenden Einträge gefunden.',
    noMissingEntries: 'Keine fehlenden DB-Einträge gefunden.',
    resultItemFormat: 'Tabelle: {table}, ID: {rowId}, Bild: {imagePath}',
    missingEntryFormat: 'Datei: {fileName}',
    confirmRestoreEntries: 'Möchten Sie wirklich {count} DB-Einträge wiederherstellen?',
    
    // Status-Meldungen
    syncingStatus: 'Synchronisiere InvokeAI DB mit Ausgabeverzeichnis...',
    tableNameError: 'Bitte geben Sie mindestens einen Tabellennamen ein.',
    imageColumnError: 'Bitte geben Sie den Namen der Bildspalte ein.',
    noColumnSpecified: 'Bitte geben Sie einen Bildspaltenname ein.',
    syncCompleted: 'Synchronisierung abgeschlossen.',
    restoringImages: 'Stelle fehlende Bilder wieder her...',
    noImagesToRestore: 'Keine fehlenden Bilder zum Wiederherstellen.',
    removingEntries: 'Lösche Einträge aus der Datenbank...',
    noEntriesToRemove: 'Keine Einträge zum Löschen.',
    confirmDelete: 'Möchten Sie wirklich {count} Einträge aus der Datenbank löschen?',
    restoringDbEntries: 'Stelle fehlende DB-Einträge wieder her...',
    noDbEntriesToRestore: 'Keine fehlenden DB-Einträge zum Wiederherstellen.',
    
    // Sprachauswahl
    languageLabel: 'Sprache:',
    languageDE: 'Deutsch',
    languageEN: 'Englisch'
  },
  en: {
    // General
    appTitle: 'Tool for InvokeAI DB',
    ready: 'Ready',
    
    // Setup area
    dbLabel: 'InvokeAI DB:',
    outputDirLabel: 'Output Directory:',
    selectButton: 'Select',
    syncButton: 'Synchronize InvokeAI DB',
    
    // Tabs
    missingImagesTab: 'Missing Images',
    removedEntriesTab: 'Entries to Delete',
    missingEntriesTab: 'Missing DB Entries',
    
    // Results
    missingImagesTitle: 'Missing Images',
    removedEntriesTitle: 'Entries to Delete',
    missingEntriesTitle: 'Missing DB Entries',
    restoreImagesButton: 'Restore Images',
    removeEntriesButton: 'Delete Entries',
    restoreDbEntriesButton: 'Restore DB Entries',
    noMissingImages: 'No missing images found.',
    noRemovedEntries: 'No entries to delete found.',
    noMissingEntries: 'No missing DB entries found.',
    resultItemFormat: 'Table: {table}, ID: {rowId}, Image: {imagePath}',
    missingEntryFormat: 'File: {fileName}',
    confirmRestoreEntries: 'Do you really want to restore {count} DB entries?',
    
    // Status messages
    syncingStatus: 'Synchronizing InvokeAI DB with output directory...',
    tableNameError: 'Please enter at least one table name.',
    imageColumnError: 'Please enter the name of the image column.',
    noColumnSpecified: 'Please enter an image column name.',
    syncCompleted: 'Synchronization completed.',
    restoringImages: 'Restoring missing images...',
    noImagesToRestore: 'No missing images to restore.',
    removingEntries: 'Deleting entries from the database...',
    noEntriesToRemove: 'No entries to delete.',
    confirmDelete: 'Do you really want to delete {count} entries from the database?',
    restoringDbEntries: 'Restoring missing DB entries...',
    noDbEntriesToRestore: 'No missing DB entries to restore.',
    
    // Language selection
    languageLabel: 'Language:',
    languageDE: 'German',
    languageEN: 'English'
  }
};

// Stelle sicher, dass die Übersetzungen sowohl für Node.js als auch für den Browser verfügbar sind
if (typeof module !== 'undefined' && module.exports) {
  module.exports = translationsjs;
}

// Für direkten Zugriff im Browser
if (typeof window !== 'undefined') {
  window.appTranslations = translationsjs;
}
