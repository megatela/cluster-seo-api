const axios = require('axios');
const cheerio = require('cheerio');

const STOP_WORDS = new Set(['de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para', 'con', 'no', 'una', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'o', 'este', 'ha', 'me', 'si', 'sin', 'sobre', 'este', 'entre', 'es', 'son', 'ser', 'qué', 'cómo', 'tu', 'tus', 'muy', 'mi', 'mis', 'han', 'title']);

function detectIntent(text) { /* ... (sin cambios) ... */ }
function analyzeText(text) { /* ... (sin cambios) ... */ }

// --- FUNCIÓN DE ANÁLISIS MEJORADA (getAndAnalyzePage) ---
async function getAndAnalyzePage(url) {
    const startTime = Date.now();
    const response = await axios.get(url, { headers: { /* Headers del Navegador si son necesarios */ }, timeout: 15000 });
    const responseTime = Date.now() - startTime;
    const html = response.data;
    const $ = cheerio.load(html);
    
    // --- ¡AQUÍ ESTÁ LA MEJORA! ---
    // Clonamos el cuerpo y eliminamos los elementos que no queremos analizar (scripts, estilos, etc.)
    const content = $('body').clone();
    content.find('script, style, noscript, iframe, footer, header, nav').remove();

    const title = $('title').text().trim();
    const h1 = $('h1').first().text().trim();
    const fullText = content.text().trim(); // Usamos el texto del contenido limpio
    const wordCount = fullText.split(/\s+/).length;
    const topKeywords = analyzeText(fullText);
    const detectedIntent = detectIntent(title + ' ' + h1);

    return { $, title, h1, wordCount, topKeywords, responseTime, detectedIntent };
}

// El resto del código no necesita cambios, pero lo incluyo completo.

function detectIntent(text) {
    const lowerText = text.toLowerCase();
    const transactionalKeywords = ['comprar', 'compra', 'comprá', 'precio', 'precios', 'oferta', 'ofertas', 'descuento', 'descuentos', 'contratar', 'presupuesto', 'tienda', 'adquirir', 'adquiere', 'carrito', 'checkout', 'pagar', 'pago', 'tarifa', 'tarifas', 'vender', 'venta', 'ventas', 'consigue', 'obtén', 'inscríbete'];
    if (transactionalKeywords.some(kw => lowerText.includes(kw))) { return 'Transaccional'; }
    const commercialKeywords = ['review', 'opinión', 'opiniones', 'comparativa', 'comparar', 'vs', 'prueba', 'análisis', 'alternativas', 'mejor', 'mejores', 'top', 'ranking', 'reseña'];
    if (commercialKeywords.some(kw => lowerText.includes(kw))) { return 'Investigación Comercial'; }
    const informationalKeywords = ['qué', 'que es', 'cómo', 'como hacer', 'guía', 'tutorial', 'lista', 'beneficios', 'ejemplos', 'aprender', 'consejos', 'estrategias', 'información', 'documentación', 'investigar', 'significado', 'definición'];
    if (informationalKeywords.some(kw => lowerText.includes(kw))) { return 'Informativa'; }
    return 'Informativa';
}

function analyzeText(text) {
    const wordCounts = {};
    const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
    for (const word of words) {
        if (word && !STOP_WORDS.has(word) && word.length > 2) { wordCounts[word] = (wordCounts[word] || 0) + 1; }
    }
    return Object.entries(wordCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(entry => entry[0]);
}

async function analyzePage(url, options = {}) {
    const { isPillar = false, pillarUrl, allSatelliteUrls = [] } = options;
    try {
        const { $, title, h1, wordCount, topKeywords, responseTime, detectedIntent } = await getAndAnalyzePage(url);
        const baseData = { url, title, h1, wordCount, topKeywords, responseTime, detectedIntent, alerts: [] };
        if (isPillar) {
            const detectedTheme = h1 || title;
            const linksToSatellites = allSatelliteUrls.map(satelliteUrl => ({ url: satelliteUrl, found: $(`a[href="${satelliteUrl}"]`).length > 0 }));
            return { ...baseData, detectedTheme, linksToSatellites };
        } else {
            let linkToPillar = false;
            let anchorText = null;
            $(`a[href="${pillarUrl}"]`).each((i, link) => {
                linkToPillar = true;
                anchorText = $(link).text().trim();
            });
            const otherSatellites = allSatelliteUrls.filter(u => u !== url);
            const interSatelliteLinks = otherSatellites.map(otherUrl => ({ url: otherUrl, found: $(`a[href="${otherUrl}"]`).length > 0 }));
            return { ...baseData, linkToPillar, anchorText, interSatelliteLinks };
        }
    } catch (error) {
        console.error(`Error analizando ${url}:`, error.message);
        const errorData = { url, title: '', h1: '', wordCount: 0, topKeywords: [], responseTime: -1, detectedIntent: 'N/A', alerts: ["No se pudo acceder o analizar la URL."] };
        if(isPillar) return { ...errorData, detectedTheme: 'Error', linksToSatellites: [] };
        return { ...errorData, linkToPillar: false, anchorText: null, interSatelliteLinks: [] };
    }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { return res.status(200).end(); }
  if (req.method === 'GET') { return res.status(200).json({ status: "API is alive and well!" }); }
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method Not Allowed' }); }
  try {
    const { pillarUrl, clusterUrls } = req.body;
    if (!pillarUrl || !clusterUrls || clusterUrls.length === 0) {
      return res.status(400).json({ error: 'Faltan URLs para analizar.' });
    }
    const pillarAnalysis = await analyzePage(pillarUrl, { isPillar: true, allSatelliteUrls: clusterUrls });
    const satellitePromises = clusterUrls.map(url => analyzePage(url, { isPillar: false, pillarUrl: pillarUrl, allSatelliteUrls: clusterUrls }));
    let satelliteAnalysis = await Promise.all(satellitePromises);
    const pillarKeywords = new Set(pillarAnalysis.topKeywords);
    satelliteAnalysis = satelliteAnalysis.map(sat => {
        if (sat.alerts.length > 0) return { ...sat, themeRelevance: 0 };
        const commonKeywords = sat.topKeywords.filter(kw => pillarKeywords.has(kw));
        const themeRelevance = Math.round((commonKeywords.length / Math.min(sat.topKeywords.length, 10)) * 100) || 0;
        return { ...sat, themeRelevance };
    });
    return res.status(200).json({ pillarAnalysis, satelliteAnalysis });
  } catch (error) {
    return res.s
