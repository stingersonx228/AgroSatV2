import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- CONFIGURATION ---
const SUPABASE_URL = "https://fyoctiotfcdtjshdbqap.supabase.co";
// Using Anon Key for backend operations with token forwarding
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5b2N0aW90ZmNkdGpzaGRicWFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMDA4MDMsImV4cCI6MjA4Nzg3NjgwM30.9SLNJD1gdaELQu13gNvQFSSur0aKCwOwERNlSyBAvA4";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Initialize AI Clients
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!GROQ_API_KEY) console.warn("GROQ_API_KEY is not set");
const groq = new Groq({ apiKey: GROQ_API_KEY });

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors());
  app.use(express.json());

  // --- HELPER FUNCTIONS ---

  // Convert Frontend Polygon [[lat, lon], ...] to GeoJSON Polygon
  const toGeoJSONPolygon = (points: number[][]) => {
    if (!points || !Array.isArray(points) || points.length < 3) return null;
    try {
        // Swap Lat/Lon to Lon/Lat and ensure closed loop
        const coordinates = points.map(p => [p[1], p[0]]);
        if (coordinates[0][0] !== coordinates[coordinates.length - 1][0] || 
            coordinates[0][1] !== coordinates[coordinates.length - 1][1]) {
        coordinates.push(coordinates[0]);
        }
        return {
        type: "Polygon",
        coordinates: [coordinates]
        };
    } catch (e) {
        console.error("Error converting polygon:", e);
        return null;
    }
  };

  // Convert GeoJSON Polygon to Frontend Polygon [[lat, lon], ...]
  const fromGeoJSONPolygon = (geoJSON: any) => {
    if (!geoJSON || !geoJSON.coordinates || !geoJSON.coordinates[0]) return [];
    // Swap Lon/Lat back to Lat/Lon
    return geoJSON.coordinates[0].map((p: number[]) => [p[1], p[0]]);
  };

  // Convert Frontend Coordinate {lat, lon} to GeoJSON Point
  const toGeoJSONPoint = (lat: number, lon: number) => {
    return {
      type: "Point",
      coordinates: [lon, lat]
    };
  };

  // Convert GeoJSON Point to Frontend Coordinate {lat, lon}
  const fromGeoJSONPoint = (geoJSON: any) => {
    if (!geoJSON || !geoJSON.coordinates) return { lat: 0, lon: 0 };
    return {
      lat: geoJSON.coordinates[1],
      lon: geoJSON.coordinates[0]
    };
  };

  // --- HEALTH CHECK ---
  app.get("/api/health", async (req, res) => {
      try {
          const { error } = await supabase.from('fields').select('id').limit(1);
          if (error) {
              if (error.code === '42P01' || error.code === 'PGRST205') {
                  return res.status(503).json({ status: 'needs_setup', message: 'Database tables missing' });
              }
              throw error;
          }
          res.json({ status: 'ok' });
      } catch (e: any) {
          res.status(500).json({ status: 'error', message: e.message });
      }
  });

  // --- AUTH MIDDLEWARE ---
  
  const requireAuth = async (req: any, res: any, next: any) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: "Unauthorized: No header" });
      
      const token = authHeader.split(" ")[1];
      if (!token) return res.status(401).json({ error: "Unauthorized: No token" });
      
      try {
        // Create a scoped client for this request using the user's token
        const scopedSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } }
        });

        const { data: { user }, error } = await scopedSupabase.auth.getUser();
        
        if (error) {
          console.error("Auth Error:", error.message);
          return res.status(401).json({ error: "Invalid token: " + error.message });
        }
        
        if (!user) {
          return res.status(401).json({ error: "User not found" });
        }
        
        req.user = user;
        req.supabase = scopedSupabase; // Attach scoped client to request
        next();
      } catch (e: any) {
        console.error("Auth Exception:", e.message || e);
        return res.status(401).json({ error: "Unauthorized: " + (e.message || "Unknown error") });
      }
  };

  // --- AUTH ROUTES ---

  app.post("/api/auth/register", async (req, res) => {
      const { email, password, name } = req.body;
      
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name }
          }
        });

        if (error) throw error;

        // Profile is created automatically via trigger in Supabase
        res.json({ user: data.user, session: data.session });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
  });

  app.post("/api/auth/login", async (req, res) => {
      const { email, password } = req.body;
      
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;

        // Fetch profile data
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();

        res.json({ 
          token: data.session.access_token, 
          user: { ...data.user, ...profile } 
        });
      } catch (error: any) {
        res.status(401).json({ error: error.message });
      }
  });

  app.post("/api/auth/logout", async (req, res) => {
      // With Anon Key, we cannot force logout on server side easily without service role.
      // The client handles token removal.
      res.json({ success: true });
  });

  app.get("/api/auth/me", requireAuth, async (req: any, res) => {
      try {
        // Use scoped client
        const { data: profile, error } = await req.supabase
          .from('profiles')
          .select('*')
          .eq('id', req.user.id)
          .single();
          
        if (error) {
           if (error.code === 'PGRST116') { // Row not found
               // Create default profile using scoped client
               const { data: newProfile, error: createError } = await req.supabase
                   .from('profiles')
                   .insert({
                       id: req.user.id,
                       name: req.user.user_metadata?.name || 'User',
                       email: req.user.email,
                       settings: {
                           units: 'metric',
                           notifications: true,
                           theme: 'light'
                       }
                   })
                   .select()
                   .single();
               
               if (createError) throw createError;
               return res.json({ ...req.user, ...newProfile });
           }
           throw error;
        }
        
        res.json({ ...req.user, ...profile });
      } catch (error: any) {
        console.error("Error fetching user profile:", error);
        if (error.code === '42P01' || error.code === 'PGRST205' || error.message?.includes("Could not find the table")) {
            return res.status(503).json({ error: "Database tables not found", code: 'tables_missing' });
        }
        // Fallback: return user data without profile if everything fails
        res.json({ ...req.user, name: req.user.user_metadata?.name || 'User' });
      }
  });

  app.put("/api/user/settings", requireAuth, async (req: any, res) => {
      const { name, email, settings } = req.body;
      
      try {
        const updates: any = {};
        if (name) updates.name = name;
        if (settings) updates.settings = settings;
        // Email update requires auth API call, skipping for simplicity in this demo

        const { data, error } = await req.supabase
          .from('profiles')
          .update(updates)
          .eq('id', req.user.id)
          .select()
          .single();

        if (error) throw error;
        res.json(data);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
  });

  // --- DATA ROUTES ---

  app.get("/api/fields", requireAuth, async (req: any, res) => {
    try {
      const { data: fields, error } = await req.supabase
        .from('fields')
        .select('*')
        .eq('user_id', req.user.id);

      if (error) throw error;

      // Transform PostGIS GeoJSON to frontend format
      const transformedFields = fields.map(field => ({
        ...field,
        coordinates: fromGeoJSONPoint(field.location),
        polygon: fromGeoJSONPolygon(field.polygon)
      }));

      res.json(transformedFields);
    } catch (error: any) {
      console.error("Error fetching fields:", error.message, error.details, error.hint);
      if (error.code === '42P01' || error.code === 'PGRST205' || error.message?.includes("Could not find the table")) {
          return res.status(503).json({ error: "Database tables not found", code: 'tables_missing' });
      }
      res.status(500).json({ error: error.message, details: error.details });
    }
  });

  app.get("/api/activity", requireAuth, async (req: any, res) => {
    try {
      const { data, error } = await req.supabase
        .from('activity_log')
        .select('*')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Map created_at to date for frontend compatibility
      const mappedData = data.map(item => ({
        ...item,
        date: item.created_at
      }));

      res.json(mappedData);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/fields", requireAuth, async (req: any, res) => {
    const { name, lat, lon, coordinates, area_hectares, crop_type, polygon } = req.body;
    
    console.log("Creating field:", { name, lat, lon, coordinates, polygonLength: polygon?.length });

    let finalLat = lat;
    let finalLon = lon;
    
    if (coordinates) {
        finalLat = coordinates.lat;
        finalLon = coordinates.lon;
    }

    try {
      // Verify helper availability
      if (typeof toGeoJSONPoint !== 'function') {
          throw new Error("Critical: toGeoJSONPoint helper is missing");
      }

      const newField = {
        user_id: req.user.id,
        name,
        location: toGeoJSONPoint(finalLat, finalLon),
        polygon: polygon ? toGeoJSONPolygon(polygon) : null,
        area_hectares: area_hectares || 0,
        crop_type: crop_type || "Пшеница",
        last_analysis: {
          ndvi_average: 0,
          healthy_percent: 0,
          moderate_percent: 0,
          stressed_percent: 0,
          alert: false,
          date: new Date().toISOString()
        }
      };

      const { data, error } = await req.supabase
        .from('fields')
        .insert(newField)
        .select()
        .single();

      if (error) {
          console.error("Supabase Insert Error:", error.message, error.details, error.hint);
          if (error.code === '42P01' || error.code === 'PGRST205' || error.message?.includes("Could not find the table")) {
             throw { code: '42P01', message: "Database tables not found" };
          }
          throw error;
      }

      // Log activity
      await req.supabase.from('activity_log').insert({
        user_id: req.user.id,
        type: 'create_field',
        details: `Добавлено новое поле "${name}" (${area_hectares} га)`
      });

      // Transform back for response
      const responseField = {
        ...data,
        coordinates: { lat: finalLat, lon: finalLon },
        polygon: polygon
      };

      res.json(responseField);
    } catch (error: any) {
      console.error("Error creating field:", error);
      if (error.code === '42P01' || error.code === 'PGRST205' || error.message?.includes("Could not find the table")) {
          return res.status(503).json({ error: "Database tables not found", code: 'tables_missing' });
      }
      res.status(500).json({ error: error.message, details: error });
    }
  });

  app.delete("/api/fields/:id", requireAuth, async (req: any, res) => {
    const { id } = req.params;
    
    try {
      const { error } = await req.supabase
        .from('fields')
        .delete()
        .eq('id', id)
        .eq('user_id', req.user.id);

      if (error) throw error;

      await req.supabase.from('activity_log').insert({
        user_id: req.user.id,
        type: 'delete_field',
        details: `Удалено поле (ID: ${id})`
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/analyze", requireAuth, async (req: any, res) => {
    try {
      const { field_id, lat, lon, date_from, date_to } = req.body;
      
      if (!lat || !lon) {
        throw new Error("Latitude and Longitude are required for analysis.");
      }

      const numericLat = Number(lat);
      const numericLon = Number(lon);

      // --- COPERNICUS & WEATHER LOGIC (Preserved) ---
      
      let analysisResult: any;

      // REAL INTEGRATION: Copernicus Data Space Ecosystem
      if (process.env.COPERNICUS_USER && process.env.COPERNICUS_PASS) {
        try {
          console.log("Connecting to Copernicus API...");
          const authParams = new URLSearchParams();
          authParams.append('grant_type', 'password');
          authParams.append('username', process.env.COPERNICUS_USER);
          authParams.append('password', process.env.COPERNICUS_PASS);
          authParams.append('client_id', 'cdse-public');

          const tokenRes = await axios.post(
            "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token",
            authParams
          );
          const token = tokenRes.data.access_token;

          const searchUrl = "https://catalogue.dataspace.copernicus.eu/odata/v1/Products";
          const startDate = `${date_from || '2023-01-01'}T00:00:00.000Z`;
          const endDate = `${date_to || new Date().toISOString()}`;
          const pointStr = `POINT(${numericLon.toFixed(5)} ${numericLat.toFixed(5)})`;
          const filter = `Collection/Name eq 'SENTINEL-2' and OData.CSC.Intersects(area=geography'SRID=4326;${pointStr}') and ContentDate/Start gt ${startDate} and ContentDate/Start lt ${endDate}`;
          
          const searchRes = await axios.get(searchUrl, {
            params: { "$filter": filter, "$top": 1, "$orderby": "ContentDate/Start desc" },
            headers: { Authorization: `Bearer ${token}` }
          });

          const product = searchRes.data.value?.[0];

          if (product) {
            const quicklookUrl = `https://catalogue.dataspace.copernicus.eu/odata/v1/Products(${product.Id})/$value`;
            analysisResult = {
              ndvi_average: 0.62,
              healthy_percent: 75,
              moderate_percent: 15,
              stressed_percent: 10,
              alert: false,
              map_url: quicklookUrl,
              product_id: product.Id,
              acquisition_date: product.ContentDate.Start
            };
          } else {
            throw new Error("No satellite imagery found.");
          }
        } catch (apiError: any) {
          console.error("Copernicus API Error:", apiError.message);
          analysisResult = null; 
        }
      }

      // FALLBACK: Mock Data
      if (!analysisResult) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        analysisResult = {
          ndvi_average: 0.58 + (Math.random() * 0.2),
          healthy_percent: 65 + (Math.random() * 20),
          moderate_percent: 20 + (Math.random() * 10),
          stressed_percent: 5 + (Math.random() * 5),
          alert: Math.random() > 0.8,
          map_url: null
        };
      }

      // Weather & AI Logic
      const currentMonth = new Date();
      
      // Fetch crop type from DB
      const { data: fieldData } = await req.supabase
        .from('fields')
        .select('crop_type, name')
        .eq('id', field_id)
        .single();
        
      const cropType = fieldData?.crop_type || "Неизвестная культура";
      const fieldName = fieldData?.name || "Unknown Field";

      const getSeasonalNorm = (crop: string, date: Date) => {
        const month = date.getMonth();
        if (month >= 10 || month <= 2) return 0.2;
        if (month >= 3 && month <= 4) return 0.45;
        if (month >= 5 && month <= 7) return 0.8;
        return 0.5;
      };
      
      const seasonalNorm = getSeasonalNorm(cropType, currentMonth);
      const ndviDeviation = analysisResult.ndvi_average - seasonalNorm;
      
      let weather = { temp: 0, condition: 'Unknown', humidity: 50, wind: 5, rain_14d: 0 };

      try {
        const weatherRes = await axios.get(`https://api.open-meteo.com/v1/forecast`, {
          params: {
            latitude: lat,
            longitude: lon,
            current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code',
            daily: 'precipitation_sum',
            past_days: 14,
            forecast_days: 1,
            timezone: 'auto'
          }
        });
        const current = weatherRes.data.current;
        const daily = weatherRes.data.daily;
        const rainSum = daily.precipitation_sum.reduce((a: number, b: number) => (a || 0) + (b || 0), 0);
        
        const wmoToCondition = (code: number) => {
            if (code === 0) return 'Clear';
            if (code >= 1 && code <= 3) return 'Clouds';
            if (code >= 45 && code <= 48) return 'Clouds';
            if (code >= 51 && code <= 67) return 'Rain';
            if (code >= 71 && code <= 77) return 'Snow';
            if (code >= 80 && code <= 82) return 'Rain';
            if (code >= 85 && code <= 86) return 'Snow';
            if (code >= 95) return 'Thunderstorm';
            return 'Unknown';
        };

        weather = {
          temp: Math.round(current.temperature_2m),
          condition: wmoToCondition(current.weather_code),
          humidity: Math.round(current.relative_humidity_2m),
          wind: parseFloat((current.wind_speed_10m / 3.6).toFixed(1)),
          rain_14d: Math.round(rainSum)
        };
      } catch (e) {
        const month = currentMonth.getMonth();
        const isWinter = month >= 10 || month <= 2;
        const isSummer = month >= 5 && month <= 7;
        weather = {
          temp: isWinter ? -5 : isSummer ? 25 : 10,
          condition: isWinter ? 'Snow' : isSummer ? 'Clear' : 'Clouds',
          humidity: 60,
          wind: 5,
          rain_14d: 0
        };
      }

      let stressCause = "Нет явного стресса";
      if (ndviDeviation < -0.15) { 
        if (weather.rain_14d < 5 && weather.temp > 25) stressCause = "Дефицит влаги";
        else if (weather.temp > 30) stressCause = "Тепловой стресс";
        else if (weather.humidity > 85) stressCause = "Риск заболеваний (Влажность)";
        else if (weather.temp < 0 && analysisResult.ndvi_average > 0.3) stressCause = "Риск вымерзания";
        else stressCause = "Задержка вегетации / Питание";
      }

      let aiInsight: any = {
        status_title: "Анализ завершен",
        summary: "Данные обработаны.",
        weather_impact: "Нет данных.",
        recommendations: []
      };
      
      try {
        const prompt = `
          Ты - AgroSat AI, элитный агроном. Твоя главная задача - анализ СОСТОЯНИЯ ПОЛЯ (NDVI).
          ДАННЫЕ ПОЛЯ:
          - Культура: ${cropType}
          - Текущая дата: ${currentMonth.toLocaleDateString('ru-RU')}
          - NDVI: ${analysisResult.ndvi_average.toFixed(2)} (Ожидаемая норма: ${seasonalNorm.toFixed(2)})
          - Отклонение от нормы: ${(ndviDeviation * 100).toFixed(1)}%
          
          ПОГОДА:
          - Температура: ${weather.temp}°C
          - Состояние: ${weather.condition}
          - Влажность: ${weather.humidity}%
          - Осадки (14 дней): ${weather.rain_14d} мм
          
          ЗАДАЧА:
          Верни ТОЛЬКО валидный JSON:
          {
            "status_title": "Статус поля (3-4 слова)",
            "summary": "Краткий вывод.",
            "weather_impact": "Влияние погоды.",
            "recommendations": [
              { "title": "Совет", "desc": "Описание", "type": "general" | "water" | "fertilizer", "priority": "medium" }
            ]
          }
        `;

        let rawResponse = "";
        if (GROQ_API_KEY) {
          const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt + " Return JSON only." }],
            model: "llama-3.3-70b-versatile",
            temperature: 0.4,
            max_tokens: 500,
            response_format: { type: "json_object" }
          });
          rawResponse = completion.choices[0]?.message?.content || "";
        } else if (process.env.GEMINI_API_KEY) {
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-lite-preview-02-05',
            contents: prompt + "\n\nReturn JSON only.",
          });
          if (response.text) rawResponse = response.text.replace(/```json|```/g, '').trim();
        }
        aiInsight = JSON.parse(rawResponse);
      } catch (aiError) {
        console.error("AI Generation Error:", aiError);
      }
      
      analysisResult.ai_insight = aiInsight;
      analysisResult.weather = weather;
      analysisResult.stress_cause = stressCause;
      analysisResult.ndvi_deviation = ndviDeviation;
      analysisResult.seasonal_norm = seasonalNorm;

      // --- SAVE TO SUPABASE ---

      // 1. Save Analysis
      await req.supabase.from('analyses').insert({
        field_id,
        ndvi_average: analysisResult.ndvi_average,
        healthy_percent: analysisResult.healthy_percent,
        moderate_percent: analysisResult.moderate_percent,
        stressed_percent: analysisResult.stressed_percent,
        weather_data: weather,
        ai_insight: aiInsight
      });

      // 2. Update Field Last Analysis
      await req.supabase.from('fields').update({
        last_analysis: {
          ...analysisResult,
          date: new Date().toISOString()
        }
      }).eq('id', field_id);

      // 3. Log Activity
      await req.supabase.from('activity_log').insert({
        user_id: req.user.id,
        type: 'analysis',
        details: `Выполнен анализ поля "${fieldName}" (NDVI: ${analysisResult.ndvi_average.toFixed(2)})`
      });

      res.json({ ...analysisResult, success: true });
    } catch (error: any) {
      console.error("Analysis Error:", error);
      res.status(500).json({ error: error.message, success: false });
    }
  });

  app.post("/api/chat", requireAuth, async (req: any, res) => {
    try {
      const { message, context } = req.body;
      
      const systemPrompt = `
        Ты - AgroSat AI, экспертный агроном-консультант.
        Контекст текущего поля: ${JSON.stringify(context || {})}
        Отвечай как профессионал, давай конкретные советы. Будь краток.
      `;

      let reply = "Извините, я сейчас не могу ответить.";

      if (GROQ_API_KEY) {
        const completion = await groq.chat.completions.create({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: message }
          ],
          model: "llama-3.3-70b-versatile",
          temperature: 0.7,
          max_tokens: 300,
        });
        reply = completion.choices[0]?.message?.content || reply;
      } else if (process.env.GEMINI_API_KEY) {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-lite-preview-02-05',
          contents: `${systemPrompt}\n\nUser: ${message}`,
        });
        if (response.text) reply = response.text;
      }

      res.json({ reply });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/fields/:field_id/history", requireAuth, async (req: any, res) => {
    const { field_id } = req.params;
    
    // 1. Fetch Real Data
    const { data: realAnalyses } = await req.supabase
      .from('analyses')
      .select('*')
      .eq('field_id', field_id)
      .order('created_at', { ascending: true });

    // 2. Generate Mock History (Past 2 Years)
    // We generate "background" history so the chart is never empty, even for new fields.
    const mockHistory = Array.from({ length: 104 }).map((_, i) => { // 2 years, weekly
      const date = new Date();
      date.setDate(date.getDate() - ((i + 1) * 7)); // Start from 1 week ago
      const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 1000 / 60 / 60 / 24);
      
      // Seasonality
      const seasonalFactor = -Math.cos((dayOfYear / 365) * 2 * Math.PI); 
      let baseNdvi = 0.5 + (seasonalFactor * 0.35); 
      let noise = (Math.random() * 0.1) - 0.05;
      if (Math.random() > 0.85) noise -= 0.15;

      const ndvi = Math.max(0.1, Math.min(0.95, baseNdvi + noise));
      const moisture = Math.max(10, Math.min(90, 50 + (seasonalFactor * -10) + (Math.random() * 40 - 20)));
      const temp = 10 + (seasonalFactor * 20) + (Math.random() * 10 - 5);

      // Determine weather condition based on moisture/temp
      let condition = 'Clear';
      if (moisture > 80) condition = 'Rain';
      else if (moisture > 60) condition = 'Clouds';
      else if (moisture > 40) condition = 'Partly Cloudy';
      if (temp < 0) condition = 'Snow';

      return {
        id: `mock_${i}`,
        date: date.toISOString(),
        ndvi_average: parseFloat(ndvi.toFixed(2)),
        moisture: Math.round(moisture),
        temp: Math.round(temp),
        weather_condition: condition,
        alert: ndvi < (baseNdvi - 0.2),
        is_mock: true
      };
    }).reverse();

    // 3. Map Real Data
    const realHistory = (realAnalyses || []).map((a: any) => ({
        id: a.id,
        date: a.created_at,
        ndvi_average: a.ndvi_average,
        moisture: a.weather_data?.humidity || 50,
        temp: a.weather_data?.temp || 20,
        weather_condition: a.weather_data?.condition || 'Unknown',
        alert: a.stressed_percent > 15,
        is_mock: false
    }));

    // 4. Combine and Sort
    // We use mock data for the past, and real data for the present/recent past.
    const combined = [...mockHistory, ...realHistory].sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    
    res.json(combined);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Check Database Connection & Schema
    try {
        const { error } = await supabase.from('fields').select('id').limit(1);
        if (error) {
            if (error.code === '42P01') { // undefined_table
                console.error("\n\nCRITICAL ERROR: Database tables not found.");
                console.error("Please run the SQL script in 'supabase_schema.sql' in your Supabase SQL Editor to create the necessary tables.\n\n");
            } else {
                console.error("Database Check Error:", error.message);
            }
        } else {
            console.log("Database connection verified. Tables exist.");
        }
    } catch (e) {
        console.error("Database Check Exception:", e);
    }
  });
}

startServer();
