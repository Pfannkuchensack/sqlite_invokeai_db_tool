# PNG Metadata Analyzer

A standalone command-line tool to analyze and filter PNG files based on their metadata. This tool is particularly useful for identifying intermediate vs. final images in InvokeAI output directories.

## Features

- Analyze PNG files in a directory and display metadata statistics
- Filter PNG files based on text chunk metadata (e.g., find all intermediate images)
- Save filtered PNG file lists to a text file for further processing
- Display detailed metadata for individual PNG files

## Installation

The PNG Metadata Analyzer is included with the SQLite InvokeAI DB Tool. To use it, you need to have Node.js installed.

```bash
# Install dependencies
npm install
```

## Usage

### Basic Commands

```bash
# Analyze all PNG files in a directory
npm run png-analyzer analyze <directory>

# Filter PNG files by metadata (e.g., find all intermediate images)
npm run png-analyzer filter <directory> parameters intermediate

# Save filtered PNG file list to a text file
npm run png-analyzer save <directory> parameters intermediate <output-file.txt>

# Inspect a single PNG file to check if metadata can be read correctly
npm run png-analyzer inspect <path-to-png-file>

# List all PNG files with unknown status (neither intermediate nor final)
npm run png-analyzer unknown <directory>

# Save the list of unknown PNG files to a text file
npm run png-analyzer unknown <directory> --save <output-file.txt>

# Compare metadata of two PNG files
npm run png-analyzer compare <file1> <file2> [options]
```

### Command Options

#### Analyze Command

```bash
npm run png-analyzer analyze <directory> [options]
```

Options:
- `-d, --detailed`: Show detailed metadata for each file

#### Filter Command

```bash
npm run png-analyzer filter <directory> <key> <value> [options]
```

Arguments:
- `directory`: Directory containing PNG files
- `key`: Text chunk key to filter by (e.g., "parameters")
- `value`: Text chunk value to filter by (e.g., "intermediate")

Options:
- `-d, --detailed`: Show detailed metadata for each file

#### Save Command

```bash
npm run png-analyzer save <directory> <key> <value> <output-file>
```

Arguments:
- `directory`: Directory containing PNG files
- `key`: Text chunk key to filter by (e.g., "parameters")
- `value`: Text chunk value to filter by (e.g., "intermediate")
- `output-file`: Path to save the filtered file list

#### Inspect Command

```bash
npm run png-analyzer inspect <file>
```

Arguments:
- `file`: Path to a single PNG file to inspect

#### Unknown Command

```bash
npm run png-analyzer unknown <directory>
```

Arguments:
- `directory`: Directory containing PNG files

Options:
- `-s, --save <file>`: Save the list of unknown files to a file

#### Compare Command

```bash
npm run png-analyzer compare <file1> <file2> [options]
```

Arguments:
- `file1`: Path to the first PNG file to compare
- `file2`: Path to the second PNG file to compare

Options:
- `-d, --detailed`: Show detailed comparison including all text chunks and node differences

## Examples

### Find all intermediate images

```bash
npm run png-analyzer filter C:\path\to\images parameters intermediate
```

### Save a list of all final images

```bash
npm run png-analyzer save C:\path\to\images parameters final final_images.txt
```

### Show detailed metadata for all PNG files

```bash
npm run png-analyzer analyze C:\path\to\images --detailed
```

### Inspect a single PNG file

```bash
npm run png-analyzer inspect C:\path\to\images\example.png
```

### List all unknown PNG files

```bash
npm run png-analyzer unknown C:\path\to\images
```

### Save list of unknown PNG files

```bash
npm run png-analyzer unknown C:\path\to\images --save unknown_images.txt
```

### Compare two PNG files

```bash
npm run png-analyzer compare C:\path\to\images\file1.png C:\path\to\images\file2.png
```

### Compare two PNG files with detailed information

```bash
npm run png-analyzer compare C:\path\to\images\file1.png C:\path\to\images\file2.png --detailed
```

## Understanding PNG Metadata

InvokeAI embeds metadata in PNG files using text chunks. Common text chunks include:

- `parameters`: Contains generation parameters, including whether the image is intermediate or final
- `prompt`: The prompt used to generate the image
- `workflow`: Workflow information

The analyzer helps you identify and filter images based on these text chunks.
