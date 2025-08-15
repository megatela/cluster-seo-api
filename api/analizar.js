// Importamos las librerías necesarias
const axios = require('axios');
const cheerio = require('cheerio');

// --- FUNCIÓN CENTRAL DE ANÁLISIS MEJORADA ---
// Ahora extrae título y h1, además del conteo de palabras
async function getAndAnalyzePage(url) {
    const response = await axios.get(url, { timeout: 15000 });
    const html = response.data;
    const $ = cheerio.load(html);
    
    // Extracción de datos de contenido
    const title = $('title').text().trim();
    const h1 = $('h1').first().text().trim();
    const wordCount = $('body').text().trim().split(/\s+/).length;
    
    return { $, title, h1, wordCount };
}

// --- ANÁLISIS DE SATÉLITE MEJORADO ---
// Ahora devuelve el título y h1 de cada satélite
async function analyzeSatellitePage(url, pillarUrl) {
    try {
        const { $, title, h1, wordCount } = await getAndAnalyzePage(url);

        let linkToPillar = false;
        let anchorText = null;
        
        $('a').each((i, link) => {
            const href = $(link).attr('href');
            if (href === pillarUrl) {
                linkToPillar = true;
                anchorText = $(link).text().trim();
            }
        });

        return { url, linkToPillar, anchorText, wordCount, title, h1, alerts: [] };
    } catch (error) {
        console.error(`Error analizando SATÉLITE ${url}:`, error.message);
        return { url, linkToPillar: false, anchorText: null, wordCount: 0, title: '', h1: '', alerts: ["No se pudo acceder o analizar la URL."] };
    }
}

// --- ANÁLISIS DE PILAR MEJORADO ---
// Ahora calcula el "Tema Detectado"
async function analyzePillarPage(url, clusterUrls) {
    try {
        const { $, wordCount, title, h1 } = await getAndAnalyzePage(url);
        
        // Lógica para el "Tema Detectado": Priorizamos el H1, si no existe, usamos el Título.
        const detectedTheme = h1 || title;
        
        const linksToSatellites = clusterUrls.map(satelliteUrl => {
            const found = $(`a[href="${satelliteUrl}"]`).length > 0;
            return { url: satelliteUrl, found };
        });

        return { url, wordCount, title, h1, detectedTheme, linksToSatellites, alerts: [] };
    } catch (error) {
        console.error(`Error analizando PILAR ${url}:`, error.message);
        return { url, wordCount: 0, title: '', h1: '', detectedTheme: 'No se pudo determinar', linksToSatellites: [], alerts: ["No se pudo acceder a la URL Pilar."] };
    }
}


// --- LÓGICA PRINCIPAL (Handler) - Sin cambios, solo pasa los nuevos datos ---
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { return res.status(200).end(); }
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method Not Allowed' }); }

  try {
    const { pillarUrl, clusterUrls } = req.body;
    if (!pillarUrl || !clusterUrls || clusterUrls.length === 0) {
      return res.status(400).json({ error: 'Faltan URLs para analizar.' });
    }
    
    const promises = [
        analyzePillarPage(pillarUrl, clusterUrls),
        ...clusterUrls.map(url => analyzeSatellitePage(url, pillarUrl))
    ];

    const results = await Promise.all(promises);
    const pillarAnalysis = results[0];
    const satelliteAnalysis = results.slice(1);
    
    return res.status(200).json({ pillarAnalysis, satelliteAnalysis });
  } catch (error) {
    return res.status(500).json({ error: `Error en el servidor: ${error.toString()}` });
  }
}
