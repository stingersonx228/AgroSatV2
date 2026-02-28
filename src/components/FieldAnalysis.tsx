import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'motion/react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Brush, Legend } from 'recharts';
import { Play, Calendar, Download, Share2, AlertTriangle, Leaf, Info, MapPin, Sparkles, Wind, Droplets, Thermometer, Activity, Globe, Scan, HelpCircle, Sun, Cloud, CloudRain, CloudLightning, Snowflake } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toPng } from 'html-to-image';
import { MapContainer, TileLayer, Polygon, Marker, useMapEvents, Tooltip as LeafletTooltip, Circle, LayersControl, FeatureGroup, Popup } from 'react-leaflet';
import L from 'leaflet';
import { fromLatLon } from 'utm';
import AIChat from './AIChat';
import bbox from '@turf/bbox';
import pointGrid from '@turf/point-grid';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point, polygon as turfPolygon } from '@turf/helpers';

// Fix Leaflet marker icons
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Helper to center map
function MapUpdater({ center, bounds }: { center: [number, number], bounds?: L.LatLngBoundsExpression }) {
  const map = useMapEvents({});
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50] });
    } else {
      map.setView(center, 13);
    }
  }, [center, bounds, map]);
  return null;
}

import distance from '@turf/distance';

// Simple UI Tooltip Component
const InfoTooltip = ({ text }: { text: string }) => (
  <div className="group relative inline-block ml-2">
    <HelpCircle className="w-4 h-4 text-black/20 hover:text-black/50 cursor-help transition-colors" />
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-black/90 text-white text-[10px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 text-center leading-tight">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black/90" />
    </div>
  </div>
);

// Helper to get weather icon
const getWeatherIcon = (condition: string) => {
  switch (condition) {
    case 'Clear': return <Sun className="w-5 h-5 text-yellow-400" />;
    case 'Clouds': return <Cloud className="w-5 h-5 text-gray-400" />;
    case 'Rain': return <CloudRain className="w-5 h-5 text-blue-400" />;
    case 'Drizzle': return <CloudRain className="w-5 h-5 text-blue-300" />;
    case 'Thunderstorm': return <CloudLightning className="w-5 h-5 text-purple-400" />;
    case 'Snow': return <Snowflake className="w-5 h-5 text-blue-200" />;
    default: return <Sun className="w-5 h-5 text-yellow-400" />;
  }
};

// Heatmap Layer Component
const HeatmapLayer = ({ fieldPolygon }: { fieldPolygon: [number, number][] }) => {
  const gridPoints = useMemo(() => {
    if (!fieldPolygon || fieldPolygon.length < 3) return [];

    try {
      // Convert Leaflet polygon (lat, lon) to Turf polygon (lon, lat)
      const turfCoords = fieldPolygon.map(p => [p[1], p[0]]);
      // Close the polygon if needed
      if (turfCoords[0][0] !== turfCoords[turfCoords.length - 1][0] || turfCoords[0][1] !== turfCoords[turfCoords.length - 1][1]) {
        turfCoords.push(turfCoords[0]);
      }
      const poly = turfPolygon([turfCoords]);
      const box = bbox(poly);
      
      // Calculate dynamic cell size
      const widthKm = distance(point([box[0], box[1]]), point([box[2], box[1]]), { units: 'kilometers' });
      const heightKm = distance(point([box[0], box[1]]), point([box[0], box[3]]), { units: 'kilometers' });
      const areaKm = widthKm * heightKm;
      
      // Target ~60-80 points for optimal density
      const targetPoints = 70;
      const cellSide = Math.sqrt(areaKm / targetPoints);
      
      // Ensure cellSide is within reasonable bounds (e.g., min 10m, max 100m)
      const safeCellSide = Math.max(0.01, Math.min(0.1, cellSide));

      const grid = pointGrid(box, safeCellSide, { units: 'kilometers' });

      return grid.features.filter(pt => booleanPointInPolygon(pt, poly)).map((pt, i) => {
        // Simulate NDVI noise
        const noise = Math.sin(pt.geometry.coordinates[0] * 150) * Math.cos(pt.geometry.coordinates[1] * 150);
        const ndvi = Math.max(0, Math.min(1, 0.6 + (noise * 0.35))); // Base 0.6 +/- 0.35
        
        let color = '#4A8C52'; // Healthy
        let label = 'Здоровая';
        if (ndvi < 0.2) { color = '#A63D40'; label = 'Стресс'; } // Red
        else if (ndvi < 0.6) { color = '#E6A817'; label = 'Умеренная'; } // Yellow

        return {
          lat: pt.geometry.coordinates[1],
          lon: pt.geometry.coordinates[0],
          ndvi,
          color,
          label
        };
      });
    } catch (e) {
      console.error("Error generating heatmap:", e);
      return [];
    }
  }, [fieldPolygon]);

  return (
    <FeatureGroup>
      {gridPoints.map((pt, i) => (
        <Circle
          key={i}
          center={[pt.lat, pt.lon]}
          radius={12} // Slightly smaller radius for better separation
          pathOptions={{
            color: pt.color,
            fillColor: pt.color,
            fillOpacity: 0.7,
            stroke: false
          }}
        >
           <LeafletTooltip direction="top" offset={[0, -5]} opacity={1}>
             <div className="text-xs font-bold bg-white/90 px-2 py-1 rounded shadow-sm border border-black/10">
               <span className="block text-[10px] text-black/50 uppercase tracking-wider mb-0.5">NDVI</span>
               <span className={cn(
                 "text-sm",
                 pt.ndvi >= 0.6 ? "text-green-leaf" : pt.ndvi >= 0.2 ? "text-yellow-500" : "text-terra"
               )}>
                 {pt.ndvi.toFixed(2)}
               </span>
               <span className="text-[10px] text-black/40 ml-1">({pt.label})</span>
             </div>
           </LeafletTooltip>
           <Popup>
             <div className="text-center p-1">
               <div className="text-xs font-bold uppercase tracking-wider text-black/50 mb-1">Детали точки</div>
               <div className="text-lg font-mono font-bold mb-1">{pt.ndvi.toFixed(3)}</div>
               <div className={cn(
                 "text-xs font-bold px-2 py-0.5 rounded-full inline-block",
                 pt.ndvi >= 0.6 ? "bg-green-100 text-green-700" : pt.ndvi >= 0.2 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
               )}>
                 {pt.label}
               </div>
               <div className="text-[10px] text-black/40 mt-2 font-mono">
                 {pt.lat.toFixed(6)}, {pt.lon.toFixed(6)}
               </div>
             </div>
           </Popup>
        </Circle>
      ))}
    </FeatureGroup>
  );
};

// Custom Tooltip Component
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white/95 backdrop-blur-md p-4 rounded-xl shadow-xl border border-black/5 text-sm z-50">
        <p className="font-bold text-black/80 mb-3 border-b border-black/5 pb-2">
            {new Date(label).toLocaleDateString('ru-RU', {day: 'numeric', month: 'long', year: 'numeric'})}
        </p>
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-leaf" />
                  <span className="text-black/60 font-medium text-xs uppercase tracking-wider">NDVI</span>
                </div>
                <span className="font-mono font-bold text-green-leaf text-base">{data.ndvi_average.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-black/60 font-medium text-xs uppercase tracking-wider">Влажность</span>
                </div>
                <span className="font-mono font-bold text-blue-500">{data.moisture}%</span>
            </div>
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />
                  <span className="text-black/60 font-medium text-xs uppercase tracking-wider">Температура</span>
                </div>
                <span className="font-mono font-bold text-orange-500">{data.temp}°C</span>
            </div>
            {data.weather_condition && (
              <div className="flex items-center justify-between gap-4 pt-2 border-t border-black/5 mt-2">
                  <span className="text-black/50 font-medium text-xs uppercase tracking-wider">Погода</span>
                  <div className="flex items-center gap-1.5">
                    {getWeatherIcon(data.weather_condition)}
                    <span className="font-bold text-black/80">{data.weather_condition}</span>
                  </div>
              </div>
            )}
            {!data.is_mock && (
               <div className="mt-2 pt-1 text-center">
                 <span className="text-[10px] bg-gold/20 text-amber-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                   Реальные данные
                 </span>
               </div>
            )}
        </div>
      </div>
    );
  }
  return null;
};

export default function FieldAnalysis({ fieldId }: { fieldId: string | null }) {
  const [field, setField] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [timeRange, setTimeRange] = useState<'1M' | '3M' | '6M' | '1Y' | '2Y' | 'ALL'>('1Y');
  const [showGraphInfo, setShowGraphInfo] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (fieldId) {
      axios.get('/api/fields').then(res => {
        const found = res.data.find((f: any) => f.id === fieldId);
        setField(found);
      });
      axios.get(`/api/fields/${fieldId}/history`).then(res => setHistory(res.data));
    }
  }, [fieldId]);

  // Filter history based on timeRange
  const filteredHistory = React.useMemo(() => {
    if (!history.length) return [];
    
    const now = new Date();
    const cutoff = new Date();
    
    switch (timeRange) {
      case '1M': cutoff.setMonth(now.getMonth() - 1); break;
      case '3M': cutoff.setMonth(now.getMonth() - 3); break;
      case '6M': cutoff.setMonth(now.getMonth() - 6); break;
      case '1Y': cutoff.setFullYear(now.getFullYear() - 1); break;
      case '2Y': cutoff.setFullYear(now.getFullYear() - 2); break;
      case 'ALL': return history;
    }
    
    return history.filter(item => new Date(item.date) >= cutoff);
  }, [history, timeRange]);

  const runAnalysis = async () => {
    if (!field) return;
    setAnalyzing(true);
    try {
      const res = await axios.post('/api/analyze', {
        field_id: field.id,
        lat: field.coordinates.lat,
        lon: field.coordinates.lon
      });
      setField({ ...field, last_analysis: res.data });
      // Refresh history
      const histRes = await axios.get(`/api/fields/${field.id}/history`);
      setHistory(histRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDownloadMap = async () => {
    if (mapRef.current) {
      try {
        // Wait for tiles to load slightly
        await new Promise(r => setTimeout(r, 500));
        
        const dataUrl = await toPng(mapRef.current, {
          cacheBust: true,
          backgroundColor: '#000000',
          filter: (node) => !node.classList?.contains('leaflet-control-container') // Hide controls
        });
        
        const link = document.createElement('a');
        link.download = `NDVI_Report_${field.name}_${new Date().toISOString().split('T')[0]}.png`;
        link.href = dataUrl;
        link.click();
      } catch (err) {
        console.error("Failed to download map:", err);
        alert("Не удалось скачать карту. Попробуйте еще раз.");
      }
    }
  };

  if (!fieldId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-black/40 space-y-4">
        <div className="p-4 bg-surface-muted rounded-full">
          <Scan className="w-8 h-8 opacity-50" />
        </div>
        <p className="font-medium">Выберите поле для анализа</p>
      </div>
    );
  }

  if (!field) return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold"></div>
    </div>
  );

  // Calculate bounds for the SVG overlay
  const polygonBounds = field.polygon ? L.polygon(field.polygon).getBounds() : null;

  // Convert to UTM
  const utmCoords = fromLatLon(field.coordinates.lat, field.coordinates.lon);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 pb-20 font-sans">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-black/5 pb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-4xl font-bold tracking-tight text-black/90">{field.name}</h2>
            <div className={cn(
              "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 border",
              field.last_analysis?.alert 
                ? "bg-terra/10 text-terra border-terra/20" 
                : "bg-green-leaf/10 text-green-leaf border-green-leaf/20"
            )}>
              <span className={cn("w-2 h-2 rounded-full animate-pulse", field.last_analysis?.alert ? "bg-terra" : "bg-green-leaf")} />
              {field.last_analysis?.alert ? "Требует внимания" : "В норме"}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-black/50 font-medium">
            <span className="flex items-center gap-1.5">
              <Leaf className="w-4 h-4 text-gold" />
              {field.crop_type}
            </span>
            <span className="w-1 h-1 rounded-full bg-black/20" />
            <span className="font-mono">{field.area_hectares} ГА</span>
            <span className="w-1 h-1 rounded-full bg-black/20" />
            <span className="font-mono">ID: {field.id}</span>
          </div>
        </div>
        
        <button 
          onClick={runAnalysis}
          disabled={analyzing}
          className="group relative px-8 py-4 bg-black text-white rounded-2xl font-bold shadow-xl shadow-black/10 hover:shadow-2xl hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:cursor-wait overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:animate-shimmer" />
          <div className="flex items-center gap-3 relative z-10">
            {analyzing ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Анализ данных...</span>
              </>
            ) : (
              <>
                <Scan className="w-5 h-5" />
                <span>Запустить анализ</span>
              </>
            )}
          </div>
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Passport & Quick Stats (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Field Passport Card */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-black/5 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-6 text-black/40 uppercase text-xs font-bold tracking-wider">
              <Globe className="w-4 h-4" />
              Геоданные
            </div>
            
            <div className="space-y-5">
              <div className="group">
                <div className="text-xs text-black/40 mb-1 font-medium">Координаты (WGS84)</div>
                <div className="font-mono text-sm font-medium flex justify-between items-center bg-surface-muted p-3 rounded-xl group-hover:bg-black/5 transition-colors">
                  <span>{field.coordinates.lat.toFixed(6)}, {field.coordinates.lon.toFixed(6)}</span>
                  <MapPin className="w-4 h-4 text-black/20" />
                </div>
              </div>

              <div className="group">
                <div className="text-xs text-black/40 mb-1 font-medium flex items-center gap-1">
                  UTM Zone {utmCoords.zoneNum}{utmCoords.zoneLetter}
                  <span className="px-1.5 py-0.5 rounded bg-gold/10 text-gold text-[10px] font-bold">PRO</span>
                </div>
                <div className="font-mono text-sm font-medium grid grid-cols-2 gap-2">
                  <div className="bg-surface-muted p-3 rounded-xl group-hover:bg-black/5 transition-colors">
                    <span className="text-[10px] text-black/40 block">EASTING</span>
                    {Math.round(utmCoords.easting)}
                  </div>
                  <div className="bg-surface-muted p-3 rounded-xl group-hover:bg-black/5 transition-colors">
                    <span className="text-[10px] text-black/40 block">NORTHING</span>
                    {Math.round(utmCoords.northing)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* AI Insight Card */}
          <div className="relative overflow-hidden bg-black text-white p-0 rounded-3xl shadow-lg group">
            {/* Background Image with Overlay */}
            <div className="absolute inset-0 z-0">
               <img 
                 src="https://images.unsplash.com/photo-1625246333195-78d9c38ad449?q=80&w=1000&auto=format&fit=crop" 
                 alt="Agriculture AI" 
                 className="w-full h-full object-cover opacity-40 group-hover:scale-105 transition-transform duration-700"
               />
               <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/80 to-black" />
            </div>
            
            <div className="relative z-10 p-6 flex flex-col h-full">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2 text-gold">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-widest">AI Agronomist</span>
                </div>
                {field.last_analysis?.weather && (
                  <div className="flex items-center gap-3 text-xs font-medium text-white/80 bg-white/10 px-3 py-1.5 rounded-full backdrop-blur-md">
                    <span className="flex items-center gap-1">
                      {getWeatherIcon(field.last_analysis.weather.condition)}
                      {field.last_analysis.weather.temp}°C
                    </span>
                    <span className="w-px h-3 bg-white/20" />
                    <span className="flex items-center gap-1"><Droplets className="w-3 h-3" /> {field.last_analysis.weather.humidity}%</span>
                    <span className="w-px h-3 bg-white/20" />
                    <span className="flex items-center gap-1"><CloudRain className="w-3 h-3" /> {field.last_analysis.weather.rain_14d}мм</span>
                  </div>
                )}
              </div>
              
              <div className="flex-1">
                {field.last_analysis?.ai_insight && typeof field.last_analysis.ai_insight === 'object' ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    <div>
                      <h3 className="text-2xl font-bold text-white mb-2 leading-tight">
                        {field.last_analysis.ai_insight.status_title || "Анализ завершен"}
                      </h3>
                      <p className="text-sm text-white/80 leading-relaxed">
                        {field.last_analysis.ai_insight.summary}
                      </p>
                      {field.last_analysis.stress_cause && field.last_analysis.stress_cause !== "Нет явного стресса" && (
                        <div className="mt-2 inline-flex items-center gap-2 px-2 py-1 bg-red-500/20 border border-red-500/30 rounded text-xs text-red-200 font-bold">
                          <AlertTriangle className="w-3 h-3" />
                          Причина стресса: {field.last_analysis.stress_cause}
                        </div>
                      )}
                    </div>

                    {field.last_analysis.ai_insight.weather_impact && (
                       <div className="bg-white/5 border border-white/10 p-3 rounded-xl">
                         <div className="flex items-center gap-2 mb-1">
                            <div className="text-[10px] uppercase tracking-wider text-white/50 font-bold">Влияние погоды</div>
                            {field.last_analysis.weather && getWeatherIcon(field.last_analysis.weather.condition)}
                         </div>
                         <p className="text-xs text-white/90 italic">
                           "{field.last_analysis.ai_insight.weather_impact}"
                         </p>
                       </div>
                    )}

                    <div className="space-y-3">
                      <div className="text-[10px] uppercase tracking-wider text-white/50 font-bold">Рекомендации</div>
                      {field.last_analysis.ai_insight.recommendations?.map((rec: any, idx: number) => (
                        <div key={idx} className="flex gap-3 items-start group/rec">
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                            rec.priority === 'high' ? "bg-terra/20 text-terra" : "bg-white/10 text-white/70"
                          )}>
                            {rec.type === 'water' ? <Droplets className="w-4 h-4" /> :
                             rec.type === 'fertilizer' ? <Leaf className="w-4 h-4" /> :
                             rec.type === 'pest' ? <AlertTriangle className="w-4 h-4" /> :
                             <Info className="w-4 h-4" />}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white group-hover/rec:text-gold transition-colors">
                              {rec.title}
                            </div>
                            <div className="text-xs text-white/60 leading-snug mt-0.5">
                              {rec.desc}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-40 text-white/40 text-sm">
                    {analyzing ? (
                       <>
                         <Scan className="w-8 h-8 mb-3 animate-pulse text-gold" />
                         <p>Анализ спутниковых снимков...</p>
                       </>
                    ) : (
                       <>
                         <Activity className="w-8 h-8 mb-3 opacity-50" />
                         <p>Запустите анализ для получения инсайтов</p>
                       </>
                    )}
                  </div>
                )}
              </div>
              
              <div className="mt-6 pt-4 border-t border-white/10 flex justify-between items-center text-[10px] text-white/40 font-mono uppercase tracking-wider">
                <span>Model: Llama-3.3-70b</span>
                <span>Groq Inc.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Map & Metrics (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Metrics Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-black/5 flex flex-col justify-between h-32 relative overflow-hidden group">
              <div className="absolute right-0 top-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                <Leaf className="w-12 h-12" />
              </div>
              <span className="text-xs font-bold text-black/40 uppercase tracking-wider">
                NDVI Index
                <InfoTooltip text="Нормализованный вегетационный индекс. Показывает количество фотосинтетически активной биомассы." />
              </span>
              <div>
                <span className="text-4xl font-mono font-bold text-green-leaf tracking-tight">
                  {field.last_analysis?.ndvi_average.toFixed(2)}
                </span>
                <div className="h-1.5 w-full bg-black/5 rounded-full mt-2 overflow-hidden">
                  <div 
                    className="h-full bg-green-leaf rounded-full" 
                    style={{ width: `${(field.last_analysis?.ndvi_average || 0) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl shadow-sm border border-black/5 flex flex-col justify-between h-32 relative overflow-hidden group">
              <div className="absolute right-0 top-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                <Droplets className="w-12 h-12" />
              </div>
              <span className="text-xs font-bold text-black/40 uppercase tracking-wider">
                Влажность
                <InfoTooltip text="Процент покрытия здоровой растительностью. Косвенный показатель влагообеспеченности." />
              </span>
              <div>
                <span className="text-4xl font-mono font-bold text-blue-500 tracking-tight">
                  {Math.round(field.last_analysis?.healthy_percent || 0)}%
                </span>
                <span className="text-[10px] text-black/40 block mt-1">Оценка по вегетации</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl shadow-sm border border-black/5 flex flex-col justify-between h-32 relative overflow-hidden group">
              <div className="absolute right-0 top-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                <Thermometer className="w-12 h-12" />
              </div>
              <span className="text-xs font-bold text-black/40 uppercase tracking-wider">
                Стресс
                <InfoTooltip text="Доля поля с низким NDVI (<0.3). Может указывать на засуху, болезни или проблемы с почвой." />
              </span>
              <div>
                <span className={cn(
                  "text-4xl font-mono font-bold tracking-tight",
                  (field.last_analysis?.stressed_percent || 0) > 10 ? "text-terra" : "text-black/60"
                )}>
                  {Math.round(field.last_analysis?.stressed_percent || 0)}%
                </span>
                <span className="text-[10px] text-black/40 block mt-1">Критическая зона</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl shadow-sm border border-black/5 flex flex-col justify-between h-32 relative overflow-hidden group">
              <div className="absolute right-0 top-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                <Wind className="w-12 h-12" />
              </div>
              <span className="text-xs font-bold text-black/40 uppercase tracking-wider">
                Прогноз
                <InfoTooltip text="Прогнозируемое изменение биомассы на основе исторических данных за последние 30 дней." />
              </span>
              <div>
                <span className="text-lg font-bold text-black/80 leading-tight block">
                  Стабильный
                </span>
                <span className="text-[10px] text-green-leaf font-bold block mt-1 flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  Рост +2.4%
                </span>
              </div>
            </div>
          </div>

          {/* Map Section */}
          <div className="bg-white rounded-3xl shadow-sm border border-black/5 overflow-hidden">
            <div className="p-4 border-b border-black/5 flex justify-between items-center bg-surface-muted/30">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-leaf animate-pulse" />
                <h3 className="font-bold text-sm uppercase tracking-wider text-black/70">Спутниковый мониторинг</h3>
              </div>
              <button 
                onClick={handleDownloadMap}
                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-black/10 hover:bg-black/5 rounded-lg text-xs font-bold transition-colors shadow-sm"
              >
                <Download className="w-3 h-3" />
                Экспорт PDF
              </button>
            </div>
            
            <div 
              ref={mapRef}
              className="relative h-[500px] w-full bg-black group isolate"
            >
               <MapContainer 
                  center={[field.coordinates.lat, field.coordinates.lon]} 
                  zoom={13} 
                  zoomControl={false}
                  className="w-full h-full absolute inset-0 z-0"
                  style={{ background: '#0d0d0d' }}
                >
                  <MapUpdater 
                    center={[field.coordinates.lat, field.coordinates.lon]} 
                    bounds={polygonBounds}
                  />
                  <LayersControl position="topright">
                    <LayersControl.BaseLayer checked name="Спутник (Esri)">
                      <TileLayer
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        attribution="Esri"
                        maxZoom={18}
                      />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="Карта (OSM)">
                      <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution="OpenStreetMap"
                        maxZoom={19}
                      />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="Гибрид (Google)">
                      <TileLayer
                        url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                        attribution="Google"
                        maxZoom={20}
                      />
                    </LayersControl.BaseLayer>
                  </LayersControl>
                  
                  {/* Field Polygon Visualization */}
                  {field.polygon ? (
                     <>
                       <Polygon 
                         positions={field.polygon}
                         pathOptions={{ 
                           color: '#ffffff', 
                           weight: 2,
                           dashArray: '5, 5',
                           fillColor: 'transparent',
                           fillOpacity: 0,
                         }}
                       />
                       
                       {/* Render Heatmap Layer */}
                       <HeatmapLayer fieldPolygon={field.polygon} />
                     </>
                  ) : (
                     <Marker position={[field.coordinates.lat, field.coordinates.lon]} />
                  )}
                </MapContainer>
              
              {/* HUD Overlay */}
              <div className="absolute inset-0 pointer-events-none z-10 p-6 flex flex-col justify-between">
                {/* Top Bar */}
                <div className="flex justify-between items-start">
                  <div className="bg-black/60 backdrop-blur-md p-4 rounded-xl border border-white/10 text-white shadow-2xl">
                    <h3 className="font-bold text-lg tracking-tight">{field.name}</h3>
                    <div className="flex items-center gap-4 mt-2 text-xs font-mono text-white/60">
                      <span>LAT: {field.coordinates.lat.toFixed(4)}</span>
                      <span>LON: {field.coordinates.lon.toFixed(4)}</span>
                    </div>
                  </div>
                  
                  <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[10px] font-bold text-white tracking-widest uppercase">LIVE FEED</span>
                  </div>
                </div>

                {/* Bottom Bar */}
                <div className="flex justify-between items-end">
                  <div className="bg-black/60 backdrop-blur-md p-4 rounded-xl border border-white/10 text-white shadow-2xl max-w-xs">
                    <div className="text-[10px] font-bold text-white/40 uppercase mb-2 tracking-wider">Спектральный анализ</div>
                    <div className="flex items-center gap-3">
                      <div className="text-3xl font-mono font-bold">{field.last_analysis?.ndvi_average.toFixed(2)}</div>
                      <div className="text-xs text-white/60 leading-tight">
                        Средний показатель<br/>вегетационного индекса
                      </div>
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="bg-black/60 backdrop-blur-md p-4 rounded-xl border border-white/10 text-white shadow-2xl w-64">
                    <div className="text-[10px] font-bold text-white/40 uppercase mb-2 tracking-wider">Легенда NDVI</div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#4A8C52]" />
                        <div className="flex-1 text-[10px] font-bold uppercase">Здоровая (0.6 - 1.0)</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#E6A817]" />
                        <div className="flex-1 text-[10px] font-bold uppercase">Слабая (0.2 - 0.6)</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#A63D40]" />
                        <div className="flex-1 text-[10px] font-bold uppercase">Почва/Стресс (&lt; 0.2)</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* History Chart Section */}
      <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-black/5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h3 className="font-bold text-xl mb-1">Динамика развития</h3>
            <p className="text-sm text-black/50">Исторические данные NDVI, влажности и температуры</p>
          </div>
          
          <div className="flex bg-surface-muted p-1 rounded-xl overflow-x-auto max-w-full">
            {['1M', '3M', '6M', '1Y', '2Y', 'ALL'].map((range) => (
              <button 
                key={range}
                onClick={() => setTimeRange(range as any)}
                className={cn(
                  "px-3 md:px-4 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap",
                  timeRange === range 
                    ? "bg-white text-black shadow-sm" 
                    : "text-black/40 hover:text-black/70"
                )}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filteredHistory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorNdvi" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4A8C52" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#4A8C52" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorMoisture" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#00000008" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(d) => new Date(d).toLocaleDateString('ru-RU', {day: '2-digit', month: 'short'})}
                axisLine={false}
                tickLine={false}
                tick={{fontSize: 11, fill: '#00000040', fontWeight: 500}}
                dy={15}
                minTickGap={40}
              />
              <YAxis 
                yAxisId="left"
                domain={[0, 1]} 
                axisLine={false}
                tickLine={false}
                tick={{fontSize: 11, fill: '#4A8C52', fontWeight: 500}}
                dx={-10}
                label={{ value: 'NDVI', angle: -90, position: 'insideLeft', fill: '#4A8C52', fontSize: 10, fontWeight: 'bold' }}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                domain={[0, 100]} 
                axisLine={false}
                tickLine={false}
                tick={{fontSize: 11, fill: '#3B82F6', fontWeight: 500}}
                dx={10}
                label={{ value: 'Влажность %', angle: 90, position: 'insideRight', fill: '#3B82F6', fontSize: 10, fontWeight: 'bold' }}
              />
              <ReferenceLine yAxisId="left" y={0.6} stroke="#4A8C52" strokeDasharray="3 3" label={{ value: 'Здоровая зона', position: 'insideTopLeft', fill: '#4A8C52', fontSize: 10, fontWeight: 'bold' }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={36} iconType="circle" />
              <Area 
                yAxisId="left"
                type="monotone" 
                dataKey="ndvi_average" 
                name="ndvi_average"
                stroke="#4A8C52" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorNdvi)" 
                activeDot={{ r: 6, strokeWidth: 0, stroke: '#fff', strokeOpacity: 0.5 }}
                animationDuration={1500}
              />
              <Area 
                yAxisId="right"
                type="monotone" 
                dataKey="moisture" 
                name="moisture"
                stroke="#3B82F6" 
                strokeWidth={2}
                strokeDasharray="5 5"
                fillOpacity={1} 
                fill="url(#colorMoisture)" 
                animationDuration={1500}
              />
              <Brush 
                dataKey="date" 
                height={30} 
                stroke="#00000020" 
                fill="#f5f5f5"
                tickFormatter={(d) => new Date(d).toLocaleDateString('ru-RU', {month: 'short', year: '2-digit'})}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* AI Chat Widget */}
      <AIChat fieldContext={field} />
    </div>
  );
}
