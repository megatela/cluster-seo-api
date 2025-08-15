// Importamos las librerías necesarias
const axios = require('axios');
const cheerio = require('cheerio');

// Esta es la función principal para Vercel
export default async function handler(req, res) {
  // Configurar cabeceras para CORS (permitir llamadas desde tu blog)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Vercel maneja una petición 'OPTIONS' automáticamente para CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Solo permitimos el método POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // En Vercel, los datos vienen en req.body directamente
    const { pillarUrl, clusterUrls } = req.body;

    if (!pillarUrl || !clusterUrls || clusterUrls.length === 0) {
      return res.status(400).json({ error: 'Faltan URLs para analizar.' });
    }
    
    // --- La lógica interna de análisis es idéntica ---
    const analyzeUrl = async (url) => {
        try {
            const response = await axios.get(url, { timeout: 10000 });
            const html = response.data;
            const $ = cheerio.load(html);

            let linksToPillar = false;
            let anchorText = null;
            $('a').each((i, link) => {
                const href = $(link).attr('href');
                if (href === pillarUrl) {
                    linksToPillar = true;
                    anchorText = $(link).text().trim(); // Extraemos el texto ancla
                }
            });

            return { url: url, linkToPillar: linksToPillar, anchorText: anchorText, alerts: [] };
        } catch (error) {
            console.error(`Error analizando ${url}:`, error.message);
            return { url: url, linkToPillar: false, anchorText: null, alerts: ["No se pudo acceder o analizar la URL."] };
        }
    };

    const satelliteAnalysisPromises = clusterUrls.map(url => analyzeUrl(url));
    const satellites = await Promise.all(satelliteAnalysisPromises);
    
    // Devolvemos el resultado usando el objeto 'res' de Vercel
    return res.status(200).json({
        pillar: { url: pillarUrl },
        satellites: satellites
    });

  } catch (error) {
    return res.status(500).json({ error: `Error en el servidor: ${error.toString()}` });
  }
}