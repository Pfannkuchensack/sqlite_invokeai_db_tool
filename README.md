# InvokeAI DB Tool

This project is not affiliated with InvokeAI in any way. 

A tool for managing and analyzing InvokeAI database entries and PNG metadata.

## Features

### Database Management
- **Synchronization**: Match between database and output directory
- **Restoration**: Add missing database entries for existing images
- **Cleanup**: Remove database entries for non-existent images
- **Metadata Extraction**: Automatic extraction and storage of InvokeAI metadata
- **Workflow Detection**: Identification and flagging of images with workflow information

### PNG Metadata Analysis
- **Inspection**: Detailed analysis of PNG metadata, including InvokeAI-specific chunks
- **Filtering**: Identification of final and intermediate images
- **Comparison**: Direct comparison of metadata between two PNG files
- **Classification**: Distinction between final images and intermediate steps

## Installation

### Prerequisites
- Node.js (recommended: version 14 or higher)
- npm or yarn
- Electron

### Installation

```bash
# Clone repository
git clone https://github.com/Pfannkuchensack/sqlite_invokeai_db_tool.git
cd sqlite_invokeai_db_tool

# Install dependencies
npm install

# Start application
npm start
```

### Package Creation

```bash
# For Windows
npm run package-win
# or
npm run make
```

## Usage

### Main Application

1. Start the application with `npm start` or use the compiled version
2. Select the SQLite database file from InvokeAI
3. Choose the output directory where the images are stored
4. Use the various functions for synchronization and management

### PNG Metadata Analyzer CLI

For detailed information on using the PNG Metadata Analyzer, see [README-PNG-ANALYZER.md](README-PNG-ANALYZER.md).

## Technical Details

### Metadata Detection

The tool recognizes different types of InvokeAI metadata in PNG files:

- **invokeai_metadata**: Contains general information about the image generation
- **invokeai_graph**: Contains the processing graph with nodes and connections
- **invokeai_workflow**: Contains workflow information for reuse

### Image Classification

Images are classified based on their metadata:

- **Final Images**: Images with `invokeai_metadata`
- **Intermediate Images**: Images with exclusively `is_intermediate=true` nodes
- **Unknown Images**: Images without recognizable InvokeAI metadata

## License

MIT

## Author

Pfannkuchensack

*[German version available here](README.de.md)*