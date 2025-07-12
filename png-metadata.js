const fs = require('fs-extra');
const path = require('path');
const { PNG } = require('pngjs');

/**
 * Reads metadata from a PNG file
 * @param {string} filePath - Path to the PNG file
 * @returns {Promise<Object>} - Object containing PNG metadata
 */
async function readPngMetadata(filePath) {
  return new Promise((resolve, reject) => {
    try {
      const stream = fs.createReadStream(filePath);
      const png = new PNG();
      
      stream.pipe(png)
        .on('metadata', (metadata) => {
          // Store the metadata
          png.metadata = metadata;
        })
        .on('parsed', function() {
          // Extract text chunks (tEXt chunks)
          const textChunks = {};
          if (this.text) {
            Object.keys(this.text).forEach(key => {
              textChunks[key] = this.text[key];
            });
          }
          
          // Create result object with all metadata
          const result = {
            width: this.width,
            height: this.height,
            bitDepth: this.bpp * 8 / 4, // bits per pixel / channels
            colorType: this.colorType,
            textChunks: textChunks,
            fileName: path.basename(filePath),
            filePath: filePath
          };
          
          resolve(result);
        })
        .on('error', (err) => {
          reject(err);
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
    
    // Read metadata for each PNG file
    const metadataPromises = pngFiles.map(file => 
      readPngMetadata(path.join(directoryPath, file))
    );
    
    // Wait for all metadata to be read
    return await Promise.all(metadataPromises);
    
  } catch (error) {
    console.error('Error analyzing PNG files:', error);
    throw error;
  }
}

/**
 * Filters PNG files based on metadata criteria
 * @param {Array} pngMetadataList - List of PNG metadata objects
 * @param {Object} criteria - Filter criteria
 * @returns {Array} - Filtered list of PNG metadata objects
 */
function filterPngByMetadata(pngMetadataList, criteria) {
  return pngMetadataList.filter(metadata => {
    // Check each criterion
    for (const [key, value] of Object.entries(criteria)) {
      if (key === 'textChunks') {
        // For text chunks, check if any of the specified keys match
        for (const [chunkKey, chunkValue] of Object.entries(value)) {
          if (!metadata.textChunks[chunkKey] || 
              !metadata.textChunks[chunkKey].includes(chunkValue)) {
            return false;
          }
        }
      } else if (metadata[key] !== value) {
        return false;
      }
    }
    return true;
  });
}

module.exports = {
  readPngMetadata,
  analyzePngFiles,
  filterPngByMetadata
};
