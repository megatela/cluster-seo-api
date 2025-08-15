// Usamos 'require' para importar las librerías, el método estándar y más compatible.
const axios = require('axios');
const cheerio = require('cheerio');

// --- LISTA DE STOP WORDS EN ESPAÑOL ---
const STOP_WORDS = new Set(['de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para', 'con', 'no', 'una', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'o', 'este', 'ha', 'me', 'si', 'sin', 'sobre', 'este', 'entre', 'es', 'son', 'ser', 'qué', 'cómo', 'tu', 'tus', 'muy', 'mi', 'mis', 'han']);

function analyzeText(text) {
    const wordCounts = {};
    const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
    for (const word of words) {
        if (word && !STOP_WORDS.has(word) && word.length > 2) {
            wordCounts[word] = (wordCounts[word] || 0) + 1;
        }
    }
    return Object.entries(wordCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(entry => entry[0]);
}

async function getAndAnalyzePage(url) {
    const startTime = Date.now();
    const response = await axios.get(url, { timeout: 15000 });
    const responseTime = Date.now() - startTime;
    const html = response.data;
    const $ = cheerio.load(html);
    const title = $('title').text().trim();
    const h1 = $('h1').first().text().trim();
    const fullText = $('body').text().trim();
    const wordCount = fullText.split(/\s+/).length;
    const topKeywords = analyzeText(fullText);
    return { $, title, h1, wordCount, topKeywords, responseTime };
}

async function analyzePage(url, isPillar = false, pillarUrl = null, clusterUrls = []) {
    try {
        const { $, title, h1, wordCount, topKeywords, responseTime } = await getAndAnalyzePage(url);
        const baseData = { url, title, h1, wordCount, topKeywords, responseTime, alerts: [] };
        if (isPillar) {
            const detectedTheme = h1 || title;
            const linksToSatellites = clusterUrls.map(satelliteUrl => ({ url: satelliteUrl, found: $(`a[href="${satelliteUrl}"]`).length > 0 }));
            return { ...baseData, detectedTheme, linksToSatellites };
        } else {
            let linkToPillar = false;
            let anchorText = null;
            $(`a[href="${pillarUrl}"]`).each((i, link) => {
                linkToPillar = true;
                anchorText = $(link).text().trim();
            });
            return { ...baseData, linkToPillar, anchorText };
        }
    } catch (error) {
        console.error(`Error analizando ${url}:`, error.message);
        const errorData = { url, title: '', h1: '', wordCount: 0, topKeywords: [], responseTime: -1, alerts: ["No se pudo acceder o analizar la URL."] };
        if(isPillar) return { ...errorData, detectedTheme: 'Error', linksToSatellites: [] };
        return { ...errorData, linkToPillar: false, anchorText: null };
    }
}

// Usamos 'module.exports' para exportar la función, el método estándar.
module.exports = async (req, res) => {
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
    const pillarAnalysis = await analyzePage(pillarUrl, true, null, clusterUrls);
    const satellitePromises = clusterUrls.map(url => analyzePage(url, false, pillarUrl));
    let satelliteAnalysis = await Promise.all(satellitePromises);
    const pillarKeywords = new Set(pillarAnalysis.topKeywords);
    satelliteAnalysis = satelliteAnalysis.map(sat => {
        if(sat.alerts.length > 0) return { ...sat, themeRelevance: 0 };
        const commonKeywords = sat.topKeywords.filter(kw => pillarKeywords.has(kw));
        const themeRelevance = Math.round((commonKeywords.length / Math.min(sat.topKeywords.length, 10)) * 100) || 0;
        return { ...sat, themeRelevance };
    });
    return res.status(200).json({ pillarAnalysis, satelliteAnalysis });
  } catch (error) {
    return res.status(500).json({ error: `Error en el servidor: ${error.toString()}` });
  }
};
