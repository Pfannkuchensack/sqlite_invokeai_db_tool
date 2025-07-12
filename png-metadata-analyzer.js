#!/usr/bin/env node

/**
 * PNG Metadata Analyzer
 * 
 * A standalone script to analyze and filter PNG files based on their metadata.
 * This script can be used to identify intermediate vs. final images in InvokeAI output.
 * 
 * Usage:
 *   node png-metadata-analyzer.js analyze <directory>
 *   node png-metadata-analyzer.js filter <directory> <key> <value>
 *   node png-metadata-analyzer.js save <directory> <key> <value> <output-file>
 */

const fs = require('fs-extra');
const path = require('path');
const PNG = require('pngjs').PNG;
const { program } = require('commander');

/**
 * Read metadata from a PNG file
 * @param {string} filePath - Path to PNG file
 * @returns {Promise<Object>} - PNG metadata
 */
function readPngMetadata(filePath) {
  return new Promise((resolve, reject) => {
    try {
      // Lese die Datei direkt als Buffer ein, um alle Chunks zu analysieren
      fs.readFile(filePath, (err, buffer) => {
        if (err) {
          reject(err);
          return;
        }
        
        try {
          // Erstelle ein PNG-Objekt
          const png = new PNG();
          
          // Parse den Buffer
          png.parse(buffer, (error, data) => {
            if (error) {
              reject(error);
              return;
            }
            
            // Extract text chunks
            const textChunks = {};
            
            // Prüfe auf text-Chunks
            if (png.text) {
              Object.keys(png.text).forEach(key => {
                textChunks[key] = png.text[key];
              });
            }
            
            // Prüfe auf tEXt-Chunks (manuell)
            // Suche nach tEXt-Chunks im Buffer
            let pos = 8; // Skip PNG header
            while (pos < buffer.length) {
              const length = buffer.readUInt32BE(pos);
              const type = buffer.toString('ascii', pos + 4, pos + 8);
              
              if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
                try {
                  // Extrahiere den Schlüssel (nullterminierter String)
                  let keyEnd = pos + 8;
                  while (buffer[keyEnd] !== 0 && keyEnd < pos + 8 + length) {
                    keyEnd++;
                  }
                  
                  const key = buffer.toString('utf8', pos + 8, keyEnd);
                  
                  // Extrahiere den Wert
                  let value = '';
                  
                  if (type === 'tEXt') {
                    // Für tEXt: Rest ist der Wert
                    value = buffer.toString('utf8', keyEnd + 1, pos + 8 + length);
                  } else if (type === 'iTXt') {
                    // iTXt hat komplexeres Format, vereinfacht
                    value = buffer.toString('utf8', keyEnd + 5, pos + 8 + length);
                  } else if (type === 'zTXt') {
                    // zTXt ist komprimiert, vereinfacht
                    value = `[Compressed data: ${length - (keyEnd - pos - 8) - 2} bytes]`;
                  }
                  
                  textChunks[key] = value;
                } catch (e) {
                  console.warn(`Fehler beim Parsen von ${type}-Chunk:`, e.message);
                }
              }
              
              // Zum nächsten Chunk
              pos += 12 + length; // 4 (length) + 4 (type) + length + 4 (CRC)
            }
            
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
                      textChunks['invokeai_graph'] = jsonStr;
                      
                      // Extrahiere is_intermediate aus dem JSON
                      if (jsonData && jsonData.nodes) {
                        for (const nodeId in jsonData.nodes) {
                          const node = jsonData.nodes[nodeId];
                          if (node.is_intermediate !== undefined) {
                            textChunks['is_intermediate'] = node.is_intermediate.toString();
                          }
                        }
                      }
                    } catch (e) {
                      console.warn('Fehler beim Parsen des JSON:', e.message);
                    }
                  }
                } catch (e) {
                  console.warn('Fehler beim Extrahieren des invokeai_graph:', e.message);
                }
              }
            }
            
            // Create result object with all metadata
            const result = {
              width: png.width,
              height: png.height,
              bitDepth: png.bpp * 8 / 4, // bits per pixel / channels
              colorType: png.colorType,
              textChunks: textChunks,
              fileName: path.basename(filePath),
              filePath: filePath
            };
            
            resolve(result);
          });
        } catch (parseError) {
          reject(parseError);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Analyzes PNG files in a directory and returns their metadata
 * @param {string} directoryPath - Path to directory containing PNG files
 * @returns {Promise<Array>} - Array of PNG metadata objects
 */
async function analyzePngFiles(directoryPath) {
  try {
    // Get all files in the directory
    const files = await fs.readdir(directoryPath);
    
    // Filter for PNG files
    const pngFiles = files.filter(file => 
      file.toLowerCase().endsWith('.png') && 
      !fs.statSync(path.join(directoryPath, file)).isDirectory()
    );
    
    console.log(`Found ${pngFiles.length} PNG files to analyze...`);
    
    // Zeige Fortschritt an
    const batchSize = 50;
    const results = [];
    
    for (let i = 0; i < pngFiles.length; i += batchSize) {
      const batch = pngFiles.slice(i, i + batchSize);
      const batchPromises = batch.map(file => 
        readPngMetadata(path.join(directoryPath, file))
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Zeige Fortschritt an
      const progress = Math.min(i + batchSize, pngFiles.length);
      const percentage = Math.floor((progress / pngFiles.length) * 100);
      process.stdout.write(`\rAnalyzing: ${progress}/${pngFiles.length} (${percentage}%)`);
    }
    
    console.log('\nAnalysis complete!');
    return results;
    
  } catch (error) {
    console.error('\nError analyzing PNG files:', error);
    throw error;
  }
}

/**
 * Filter PNG files based on metadata criteria
 * @param {Array} pngMetadata - Array of PNG metadata objects
 * @param {Object} filterCriteria - Filter criteria object
 * @returns {Array} - Filtered array of PNG metadata objects
 */
function filterPngByMetadata(pngMetadata, filterCriteria) {
  if (!pngMetadata || !filterCriteria) {
    return [];
  }
  
  return pngMetadata.filter(item => {
    // Check text chunks
    if (filterCriteria.textChunks && item.textChunks) {
      for (const [key, value] of Object.entries(filterCriteria.textChunks)) {
        if (!item.textChunks[key] || !item.textChunks[key].includes(value)) {
          return false;
        }
      }
    }
    
    return true;
  });
}

/**
 * Save a list of file paths to a text file
 * @param {Array} filePaths - Array of file paths
 * @param {string} outputPath - Path to output file
 */
async function saveFileList(filePaths, outputPath) {
  try {
    const fileContent = filePaths.join('\n');
    await fs.writeFile(outputPath, fileContent, 'utf8');
    console.log(`File list saved to: ${outputPath}`);
  } catch (error) {
    console.error('Error saving file list:', error);
    throw error;
  }
}

/**
 * Print PNG metadata statistics
 * @param {Array} metadata - Array of PNG metadata objects
 */
function printStats(metadata) {
  let intermediateImages = 0;
  let finalImages = 0;
  let unknownImages = 0;
  
  metadata.forEach(item => {
    // Prüfe auf is_intermediate
    if (item.textChunks && item.textChunks.is_intermediate !== undefined) {
      if (item.textChunks.is_intermediate === 'true') {
        intermediateImages++;
      } else if (item.textChunks.is_intermediate === 'false') {
        finalImages++;
      } else {
        unknownImages++;
      }
    }
    // Prüfe auf parameters mit intermediate/final
    else if (item.textChunks && item.textChunks.parameters) {
      if (item.textChunks.parameters.includes('intermediate')) {
        intermediateImages++;
      } else if (item.textChunks.parameters.includes('final')) {
        finalImages++;
      } else {
        unknownImages++;
      }
    }
    // Prüfe auf invokeai_graph mit is_intermediate
    else if (item.textChunks && item.textChunks.invokeai_graph) {
      try {
        const graphData = JSON.parse(item.textChunks.invokeai_graph);
        let foundIntermediate = false;
        
        if (graphData && graphData.nodes) {
          for (const nodeId in graphData.nodes) {
            const node = graphData.nodes[nodeId];
            if (node.is_intermediate === true) {
              intermediateImages++;
              foundIntermediate = true;
              break;
            } else if (node.is_intermediate === false) {
              finalImages++;
              foundIntermediate = true;
              break;
            }
          }
        }
        
        if (!foundIntermediate) {
          unknownImages++;
        }
      } catch (e) {
        unknownImages++;
      }
    } else {
      unknownImages++;
    }
  });
  
  console.log('\nStatistics:');
  console.log(`- Intermediate Images: ${intermediateImages}`);
  console.log(`- Final Images: ${finalImages}`);
  console.log(`- Unknown Images: ${unknownImages}`);
  console.log(`- Total Images: ${intermediateImages + finalImages + unknownImages}`);
}

/**
 * Print detailed metadata for a PNG file
 * @param {Object} metadata - PNG metadata object
 */
function printMetadata(metadata) {
  console.log(`\nFile: ${metadata.fileName}`);
  console.log(`Size: ${metadata.width}x${metadata.height}`);
  console.log(`Bit Depth: ${metadata.bitDepth}`);
  console.log(`Color Type: ${metadata.colorType}`);
  
  console.log('Text Chunks:');
  if (metadata.textChunks && Object.keys(metadata.textChunks).length > 0) {
    for (const [key, value] of Object.entries(metadata.textChunks)) {
      console.log(`  ${key}: ${value}`);
    }
  } else {
    console.log('  No text chunks found');
  }
}

// Set up command line interface
program
  .name('png-metadata-analyzer')
  .description('Analyze and filter PNG files based on metadata')
  .version('1.0.0');

program
  .command('analyze')
  .description('Analyze PNG files in a directory')
  .argument('<directory>', 'Directory containing PNG files')
  .option('-d, --detailed', 'Show detailed metadata for each file')
  .action(async (directory, options) => {
    try {
      console.log(`Analyzing PNG files in: ${directory}`);
      const metadata = await analyzePngFiles(directory);
      
      console.log(`Found ${metadata.length} PNG files`);
      
      if (options.detailed) {
        metadata.forEach(item => {
          printMetadata(item);
        });
      }
      
      printStats(metadata);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('filter')
  .description('Filter PNG files based on metadata')
  .argument('<directory>', 'Directory containing PNG files')
  .argument('<key>', 'Text chunk key to filter by')
  .argument('<value>', 'Text chunk value to filter by')
  .option('-d, --detailed', 'Show detailed metadata for each file')
  .action(async (directory, key, value, options) => {
    try {
      console.log(`Filtering PNG files in: ${directory}`);
      console.log(`Filter criteria: ${key}=${value}`);
      
      const metadata = await analyzePngFiles(directory);
      const filterCriteria = {
        textChunks: {
          [key]: value
        }
      };
      
      const filteredMetadata = filterPngByMetadata(metadata, filterCriteria);
      
      console.log(`Found ${filteredMetadata.length} matching PNG files out of ${metadata.length} total`);
      
      if (options.detailed) {
        filteredMetadata.forEach(item => {
          printMetadata(item);
        });
      } else {
        filteredMetadata.forEach(item => {
          console.log(item.filePath);
        });
      }
      
      printStats(filteredMetadata);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('save')
  .description('Save filtered PNG file list to a text file')
  .argument('<directory>', 'Directory containing PNG files')
  .argument('<key>', 'Text chunk key to filter by')
  .argument('<value>', 'Text chunk value to filter by')
  .argument('<output-file>', 'Output file path')
  .action(async (directory, key, value, outputFile) => {
    try {
      console.log(`Filtering PNG files in: ${directory}`);
      console.log(`Filter criteria: ${key}=${value}`);
      
      const metadata = await analyzePngFiles(directory);
      const filterCriteria = {
        textChunks: {
          [key]: value
        }
      };
      
      const filteredMetadata = filterPngByMetadata(metadata, filterCriteria);
      const filePaths = filteredMetadata.map(item => item.filePath);
      
      await saveFileList(filePaths, outputFile);
      
      console.log(`Found ${filteredMetadata.length} matching PNG files out of ${metadata.length} total`);
      printStats(filteredMetadata);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('inspect')
  .description('Inspect a single PNG file and show its metadata')
  .argument('<file>', 'Path to PNG file')
  .action(async (file) => {
    try {
      console.log(`Inspecting PNG file: ${file}`);
      
      if (!file.toLowerCase().endsWith('.png')) {
        console.error('Error: File must be a PNG file');
        process.exit(1);
      }
      
      if (!fs.existsSync(file)) {
        console.error('Error: File does not exist');
        process.exit(1);
      }
      
      const metadata = await readPngMetadata(file);
      printMetadata(metadata);
      
      console.log('\nMetadata successfully read!');
    } catch (error) {
      console.error('Error reading PNG metadata:', error.message);
      console.error('Stack trace:', error.stack);
      process.exit(1);
    }
  });

program
  .command('unknown')
  .description('List all PNG files with unknown status (neither intermediate nor final)')
  .argument('<directory>', 'Directory containing PNG files')
  .option('-s, --save <file>', 'Save the list to a file')
  .action(async (directory, options) => {
    try {
      console.log(`Analyzing PNG files in: ${directory}`);
      
      const metadata = await analyzePngFiles(directory);
      
      // Filtere unbekannte Bilder
      const unknownImages = metadata.filter(item => {
        // Prüfe auf is_intermediate
        if (item.textChunks && item.textChunks.is_intermediate !== undefined) {
          return false; // Bekannter Status
        }
        // Prüfe auf parameters mit intermediate/final
        else if (item.textChunks && item.textChunks.parameters) {
          return !item.textChunks.parameters.includes('intermediate') && 
                 !item.textChunks.parameters.includes('final');
        }
        // Prüfe auf invokeai_graph mit is_intermediate
        else if (item.textChunks && item.textChunks.invokeai_graph) {
          try {
            const graphData = JSON.parse(item.textChunks.invokeai_graph);
            
            if (graphData && graphData.nodes) {
              for (const nodeId in graphData.nodes) {
                const node = graphData.nodes[nodeId];
                if (node.is_intermediate !== undefined) {
                  return false; // Bekannter Status
                }
              }
            }
            
            return true; // Kein Status gefunden
          } catch (e) {
            return true; // Fehler beim Parsen = unbekannt
          }
        } else {
          return true; // Keine relevanten Metadaten = unbekannt
        }
      });
      
      console.log(`Found ${unknownImages.length} unknown PNG files out of ${metadata.length} total`);
      
      // Zeige die Liste der unbekannten Bilder an
      unknownImages.forEach(item => {
        console.log(item.filePath);
      });
      
      // Speichere die Liste in eine Datei, wenn gewünscht
      if (options.save) {
        const fileList = unknownImages.map(item => item.filePath).join('\n');
        await fs.writeFile(options.save, fileList);
        console.log(`File list saved to: ${options.save}`);
      }
      
      printStats(metadata);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('compare')
  .description('Compare metadata of two PNG files and show differences')
  .argument('<file1>', 'Path to first PNG file')
  .argument('<file2>', 'Path to second PNG file')
  .option('-d, --detailed', 'Show detailed comparison')
  .action(async (file1, file2, options) => {
    try {
      console.log(`Comparing PNG files:\n1: ${file1}\n2: ${file2}`);
      
      // Prüfe, ob beide Dateien existieren und PNG-Dateien sind
      for (const file of [file1, file2]) {
        if (!file.toLowerCase().endsWith('.png')) {
          console.error(`Error: ${file} is not a PNG file`);
          process.exit(1);
        }
        
        if (!fs.existsSync(file)) {
          console.error(`Error: ${file} does not exist`);
          process.exit(1);
        }
      }
      
      // Lese Metadaten beider Dateien
      const metadata1 = await readPngMetadata(file1);
      const metadata2 = await readPngMetadata(file2);
      
      // Vergleiche Grundeigenschaften
      console.log('\n=== Basic Properties ===');
      compareBasicProperties(metadata1, metadata2);
      
      // Vergleiche Text-Chunks
      console.log('\n=== Text Chunks ===');
      compareTextChunks(metadata1, metadata2, options.detailed);
      
      // Vergleiche InvokeAI Graph
      console.log('\n=== InvokeAI Graph ===');
      compareInvokeAIGraph(metadata1, metadata2, options.detailed);
      
      console.log('\nComparison completed!');
    } catch (error) {
      console.error('Error comparing PNG files:', error.message);
      console.error('Stack trace:', error.stack);
      process.exit(1);
    }
  });

/**
 * Compare basic properties of two PNG files
 * @param {Object} metadata1 - Metadata of first PNG file
 * @param {Object} metadata2 - Metadata of second PNG file
 */
function compareBasicProperties(metadata1, metadata2) {
  // Vergleiche Bildgröße
  const size1 = metadata1.size || {};
  const size2 = metadata2.size || {};
  
  if (size1.width !== size2.width || size1.height !== size2.height) {
    console.log(`Image size: ${size1.width}x${size1.height} vs ${size2.width}x${size2.height} [DIFFERENT]`);
  } else if (size1.width && size1.height) {
    console.log(`Image size: ${size1.width}x${size1.height} [SAME]`);
  }
  
  // Vergleiche Dateigröße
  const fileSize1 = metadata1.fileSize || 0;
  const fileSize2 = metadata2.fileSize || 0;
  
  if (fileSize1 !== fileSize2) {
    console.log(`File size: ${formatFileSize(fileSize1)} vs ${formatFileSize(fileSize2)} [DIFFERENT]`);
  } else {
    console.log(`File size: ${formatFileSize(fileSize1)} [SAME]`);
  }
}

/**
 * Compare text chunks of two PNG files
 * @param {Object} metadata1 - Metadata of first PNG file
 * @param {Object} metadata2 - Metadata of second PNG file
 * @param {boolean} detailed - Show detailed comparison
 */
function compareTextChunks(metadata1, metadata2, detailed) {
  const textChunks1 = metadata1.textChunks || {};
  const textChunks2 = metadata2.textChunks || {};
  
  // Sammle alle eindeutigen Schlüssel
  const allKeys = new Set([...Object.keys(textChunks1), ...Object.keys(textChunks2)]);
  
  // Zähle Unterschiede
  let differences = 0;
  
  // Vergleiche jeden Schlüssel
  for (const key of allKeys) {
    const value1 = textChunks1[key];
    const value2 = textChunks2[key];
    
    if (value1 === undefined) {
      console.log(`${key}: [MISSING IN FILE 1]`);
      differences++;
    } else if (value2 === undefined) {
      console.log(`${key}: [MISSING IN FILE 2]`);
      differences++;
    } else if (value1 !== value2) {
      if (detailed && key !== 'invokeai_graph') {
        console.log(`${key}: [DIFFERENT]`);
        console.log(`  File 1: ${truncateString(value1, 100)}`);
        console.log(`  File 2: ${truncateString(value2, 100)}`);
      } else {
        console.log(`${key}: [DIFFERENT]`);
      }
      differences++;
    } else if (detailed) {
      console.log(`${key}: [SAME]`);
    }
  }
  
  if (differences === 0) {
    console.log('All text chunks are identical');
  } else {
    console.log(`Found ${differences} differences in text chunks`);
  }
}

/**
 * Compare InvokeAI graph data of two PNG files
 * @param {Object} metadata1 - Metadata of first PNG file
 * @param {Object} metadata2 - Metadata of second PNG file
 * @param {boolean} detailed - Show detailed comparison
 */
function compareInvokeAIGraph(metadata1, metadata2, detailed) {
  const textChunks1 = metadata1.textChunks || {};
  const textChunks2 = metadata2.textChunks || {};
  
  // Prüfe, ob beide Dateien InvokeAI Graph-Daten haben
  const hasGraph1 = textChunks1.invokeai_graph !== undefined;
  const hasGraph2 = textChunks2.invokeai_graph !== undefined;
  
  if (!hasGraph1 && !hasGraph2) {
    console.log('No InvokeAI graph data in either file');
    return;
  } else if (!hasGraph1) {
    console.log('InvokeAI graph data missing in file 1');
    return;
  } else if (!hasGraph2) {
    console.log('InvokeAI graph data missing in file 2');
    return;
  }
  
  // Parse die Graph-Daten
  let graph1, graph2;
  try {
    graph1 = JSON.parse(textChunks1.invokeai_graph);
  } catch (e) {
    console.log('Invalid InvokeAI graph data in file 1');
    return;
  }
  
  try {
    graph2 = JSON.parse(textChunks2.invokeai_graph);
  } catch (e) {
    console.log('Invalid InvokeAI graph data in file 2');
    return;
  }
  
  // Vergleiche Knoten
  const nodes1 = graph1.nodes || {};
  const nodes2 = graph2.nodes || {};
  
  const allNodeIds = new Set([...Object.keys(nodes1), ...Object.keys(nodes2)]);
  
  console.log(`Nodes: ${Object.keys(nodes1).length} vs ${Object.keys(nodes2).length}`);
  
  let nodeDifferences = 0;
  let intermediateNodes1 = 0;
  let intermediateNodes2 = 0;
  let finalNodes1 = 0;
  let finalNodes2 = 0;
  
  // Zähle intermediate/final Knoten
  for (const nodeId in nodes1) {
    if (nodes1[nodeId].is_intermediate === true) intermediateNodes1++;
    if (nodes1[nodeId].is_intermediate === false) finalNodes1++;
  }
  
  for (const nodeId in nodes2) {
    if (nodes2[nodeId].is_intermediate === true) intermediateNodes2++;
    if (nodes2[nodeId].is_intermediate === false) finalNodes2++;
  }
  
  console.log(`Intermediate nodes: ${intermediateNodes1} vs ${intermediateNodes2}`);
  console.log(`Final nodes: ${finalNodes1} vs ${finalNodes2}`);
  
  // Vergleiche detailliert, wenn gewünscht
  if (detailed) {
    for (const nodeId of allNodeIds) {
      const node1 = nodes1[nodeId];
      const node2 = nodes2[nodeId];
      
      if (!node1) {
        console.log(`Node ${nodeId}: [MISSING IN FILE 1]`);
        nodeDifferences++;
      } else if (!node2) {
        console.log(`Node ${nodeId}: [MISSING IN FILE 2]`);
        nodeDifferences++;
      } else if (node1.is_intermediate !== node2.is_intermediate) {
        console.log(`Node ${nodeId}: is_intermediate = ${node1.is_intermediate} vs ${node2.is_intermediate} [DIFFERENT]`);
        nodeDifferences++;
      } else if (node1.type !== node2.type) {
        console.log(`Node ${nodeId}: type = ${node1.type} vs ${node2.type} [DIFFERENT]`);
        nodeDifferences++;
      }
    }
    
    if (nodeDifferences === 0) {
      console.log('All nodes are identical');
    } else {
      console.log(`Found ${nodeDifferences} differences in nodes`);
    }
  }
}

/**
 * Format file size in bytes to human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted file size
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Truncate a string if it's too long
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated string
 */
function truncateString(str, maxLength) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

// Parse command line arguments
program.parse();
