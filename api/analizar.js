// Importamos las librerías necesarias
const axios = require('axios');
const cheerio = require('cheerio');

// --- NUEVA FUNCIÓN ---
// Función reutilizable para obtener y analizar el HTML de CUALQUIER URL
async function getAndAnalyzePage(url) {
    const response = await axios.get(url, { timeout: 15000 }); // Aumentamos el timeout
    const html = response.data;
    const $ = cheerio.load(html);
    const wordCount = $('body').text().trim().split(/\s+/).length; // Conteo de palabras
    return { $, html, wordCount };
}

// --- FUNCIÓN MEJORADA: Ahora analiza también el conteo de palabras ---
async function analyzeSatellitePage(url, pillarUrl) {
    try {
        const { $ } = await getAndAnalyzePage(url);

        let linkToPillar = false;
        let anchorText = null;
        
        $('a').each((i, link) => {
            const href = $(link).attr('href');
            if (href === pillarUrl) {
                linkToPillar = true;
                anchorText = $(link).text().trim();
            }
        });

        const wordCount = $('body').text().trim().split(/\s+/).length;

        return { url, linkToPillar, anchorText, wordCount, alerts: [] };
    } catch (error) {
        console.error(`Error analizando SATÉLITE ${url}:`, error.message);
        return { url, linkToPillar: false, anchorText: null, wordCount: 0, alerts: ["No se pudo acceder o analizar la URL."] };
    }
}

// --- NUEVA FUNCIÓN: Lógica específica para analizar la página PILAR ---
async function analyzePillarPage(url, clusterUrls) {
    try {
        const { $, wordCount } = await getAndAnalyzePage(url);
        
        const linksToSatellites = clusterUrls.map(satelliteUrl => {
            // Buscamos un enlace que apunte exactamente a la URL del satélite
            const found = $(`a[href="${satelliteUrl}"]`).length > 0;
            return { url: satelliteUrl, found };
        });

        return { url, wordCount, linksToSatellites, alerts: [] };
    } catch (error) {
        console.error(`Error analizando PILAR ${url}:`, error.message);
        return { url, wordCount: 0, linksToSatellites: [], alerts: ["No se pudo acceder a la URL Pilar."] };
    }
}


// --- LÓGICA PRINCIPAL ACTUALIZADA ---
export default async function handler(req, res) {
  // Configuración de CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { pillarUrl, clusterUrls } = req.body;

    if (!pillarUrl || !clusterUrls || clusterUrls.length === 0) {
      return res.status(400).json({ error: 'Faltan URLs para analizar.' });
    }
    
    // Creamos una lista de todas las promesas de análisis que necesitamos ejecutar
    const promises = [
        analyzePillarPage(pillarUrl, clusterUrls), // Analizar la pilar
        ...clusterUrls.map(url => analyzeSatellitePage(url, pillarUrl)) // Analizar todas las satélites
    ];

    // Ejecutamos todas las promesas en paralelo para máxima velocidad
    const results = await Promise.all(promises);

    // Separamos los resultados
    const pillarAnalysis = results[0];
    const satelliteAnalysis = results.slice(1);
    
    // Devolvemos la nueva estructura de datos enriquecida
    return res.status(200).json({
        pillarAnalysis,
        satelliteAnalysis
    });

  } catch (error) {
    return res.status(500).json({ error: `Error en el servidor: ${error.toString()}` });
  }
}
