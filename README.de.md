# InvokeAI DB Tool

Ein Tool zur Verwaltung und Analyse von InvokeAI-Datenbankeinträgen und PNG-Metadaten.

## Funktionen

### Datenbank-Management
- **Synchronisierung**: Abgleich zwischen Datenbank und Ausgabeverzeichnis
- **Wiederherstellung**: Hinzufügen fehlender Datenbankeinträge für vorhandene Bilder
- **Bereinigung**: Entfernen von Datenbankeinträgen für nicht mehr existierende Bilder
- **Metadaten-Extraktion**: Automatische Extraktion und Speicherung von InvokeAI-Metadaten
- **Workflow-Erkennung**: Identifizierung und Kennzeichnung von Bildern mit Workflow-Informationen


## Installation

### Voraussetzungen
- Node.js (empfohlen: Version 14 oder höher)
- npm oder yarn
- Electron

### Installation

```bash
# Repository klonen
git clone https://github.com/Pfannkuchensack/sqlite_invokeai_db_tool.git
cd sqlite_invokeai_db_tool

# Abhängigkeiten installieren
npm install

# Anwendung starten
npm start
```

### Paketerstellung

```bash
# Für Windows
npm run package-win
# oder
npm run make
```

## Verwendung

### Hauptanwendung

1. Starte die Anwendung mit `npm start` oder verwende die kompilierte Version
2. Wähle die SQLite-Datenbankdatei von InvokeAI aus
3. Wähle das Ausgabeverzeichnis, in dem die Bilder gespeichert sind
4. Nutze die verschiedenen Funktionen zur Synchronisierung und Verwaltung


## Technische Details

### Metadaten-Erkennung

Das Tool erkennt verschiedene Arten von InvokeAI-Metadaten in PNG-Dateien:

- **invokeai_metadata**: Enthält allgemeine Informationen über die Bildgenerierung
- **invokeai_graph**: Enthält den Verarbeitungsgraphen mit Knoten und Verbindungen
- **invokeai_workflow**: Enthält Workflow-Informationen für die Wiederverwendung

### Bildklassifizierung

Bilder werden basierend auf ihren Metadaten klassifiziert:

- **Finale Bilder**: Bilder mit `invokeai_metadata`
- **Zwischenbilder**: Bilder mit ausschließlich `is_intermediate=true` Knoten
- **Unbekannte Bilder**: Bilder ohne erkennbare InvokeAI-Metadaten

## Lizenz

MIT

## Autor

Pfannkuchensack
