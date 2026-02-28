import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, Polygon, Polyline, LayersControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import axios from 'axios';
import { Layers, Plus, Search, X, Check, MapPin, Hexagon, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { area } from "@turf/area";
import { polygon as turfPolygon } from "@turf/helpers";

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

// Component to handle map clicks
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

import { useAuth } from '../context/AuthContext';

export default function MapView({ 
  onFieldSelect,
  isAddingField,
  setIsAddingField
}: { 
  onFieldSelect: (id: string) => void;
  isAddingField: boolean;
  setIsAddingField: (isAdding: boolean) => void;
}) {
  const { user, isLoading: authLoading } = useAuth();
  const [fields, setFields] = useState<any[]>([]);
  
  // Drawing state
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);

  const [newField, setNewField] = useState({
    name: '',
    crop_type: 'Пшеница',
    area_hectares: '0.00',
    lat: '',
    lon: ''
  });

  useEffect(() => {
    if (!authLoading && user) {
      fetchFields();
    }
  }, [authLoading, user]);

  // Reset drawing state when closing add mode
  useEffect(() => {
    if (!isAddingField) {
      setPolygonPoints([]);
      setNewField({ name: '', crop_type: 'Пшеница', area_hectares: '0.00', lat: '', lon: '' });
    }
  }, [isAddingField]);

  // Calculate area whenever polygonPoints change
  useEffect(() => {
    if (polygonPoints.length >= 3) {
      try {
        // Turf expects [lon, lat]
        const turfPoints = polygonPoints.map(p => [p[1], p[0]]);
        // Close the loop
        turfPoints.push(turfPoints[0]);
        
        const poly = turfPolygon([turfPoints]);
        const areaSqMeters = area(poly);
        const hectares = (areaSqMeters / 10000).toFixed(2);
        
        setNewField(prev => ({ ...prev, area_hectares: hectares }));
      } catch (e) {
        console.error("Error calculating area:", e);
      }
    } else {
      setNewField(prev => ({ ...prev, area_hectares: '0.00' }));
    }
  }, [polygonPoints]);

  const fetchFields = () => {
    axios.get('/api/fields')
      .then(res => {
        if (Array.isArray(res.data)) {
          setFields(res.data);
        } else {
          console.error("API returned non-array data:", res.data);
          setFields([]);
        }
      })
      .catch(err => {
        console.error("Error fetching fields:", err);
        setFields([]);
      });
  };

  const handleMapClick = (lat: number, lng: number) => {
    if (isAddingField) {
      // Polygon mode: add point to array
      setPolygonPoints(prev => [...prev, [lat, lng]]);
      
      // If this is the first point, also set it as the main coordinate for the field (center)
      if (polygonPoints.length === 0) {
         setNewField(prev => ({ ...prev, lat: lat.toFixed(5), lon: lng.toFixed(5) }));
      }
    }
  };

  const handleAddField = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!newField.name) {
      alert('Пожалуйста, заполните название');
      return;
    }

    if (polygonPoints.length < 3) {
      alert('Полигон должен содержать минимум 3 точки');
      return;
    }

    try {
      const payload: any = {
        name: newField.name,
        crop_type: newField.crop_type,
        area_hectares: parseFloat(newField.area_hectares),
        coordinates: {
          lat: parseFloat(newField.lat), // Use first point as center reference
          lon: parseFloat(newField.lon)
        },
        polygon: polygonPoints
      };

      await axios.post('/api/fields', payload);
      
      setIsAddingField(false);
      fetchFields();
    } catch (error: any) {
      console.error('Error adding field:', error);
      if (error.response?.status === 503 && error.response?.data?.code === 'tables_missing') {
          alert('Требуется настройка базы данных. Пожалуйста, перейдите на Дашборд для выполнения SQL-скрипта.');
      } else {
          alert(`Ошибка при добавлении поля: ${error.response?.data?.error || error.message}`);
      }
    }
  };

  return (
    <div className="relative w-full h-full flex">
      {/* Sidebar Overlay */}
      <div className="absolute left-4 top-4 bottom-4 w-80 bg-white/95 backdrop-blur-md rounded-3xl shadow-xl z-[1000] flex flex-col border border-black/5 overflow-hidden transition-all duration-300">
        
        {isAddingField ? (
          <div className="flex flex-col h-full">
            <div className="p-4 border-b border-black/5 flex justify-between items-center bg-gold/10">
              <h3 className="font-bold text-gold">Новое поле</h3>
              <button onClick={() => setIsAddingField(false)} className="p-1 hover:bg-black/5 rounded-full">
                <X className="w-5 h-5 text-black/60" />
              </button>
            </div>
            <form onSubmit={handleAddField} className="p-4 space-y-4 flex-1 overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-black/50 uppercase mb-1">Название</label>
                <input 
                  type="text" 
                  value={newField.name}
                  onChange={e => setNewField({...newField, name: e.target.value})}
                  className="w-full rounded-xl border-black/10 bg-surface-muted focus:ring-gold focus:border-gold"
                  placeholder="Например: Северный участок"
                />
              </div>

              {/* Drawing Instructions */}
              <div className="bg-gold/5 border border-gold/20 rounded-xl p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-gold uppercase flex items-center gap-1">
                    <Hexagon className="w-3 h-3" /> Контур поля
                  </span>
                  <span className="text-xs font-mono bg-white px-2 py-0.5 rounded border border-gold/20">{polygonPoints.length} точек</span>
                </div>
                <p className="text-[10px] text-black/60 mb-2 leading-relaxed">
                  Нажимайте на карту, чтобы поставить точки по углам поля. Площадь рассчитается автоматически.
                </p>
                {polygonPoints.length > 0 && (
                  <button 
                    type="button"
                    onClick={() => setPolygonPoints([])}
                    className="text-[10px] text-terra font-bold hover:underline flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Сбросить контур
                  </button>
                )}
              </div>
              
              <div>
                <label className="block text-xs font-bold text-black/50 uppercase mb-1">Культура</label>
                <select 
                  value={newField.crop_type}
                  onChange={e => setNewField({...newField, crop_type: e.target.value})}
                  className="w-full rounded-xl border-black/10 bg-surface-muted focus:ring-gold focus:border-gold"
                >
                  <option value="Пшеница">Пшеница</option>
                  <option value="Ячмень">Ячмень</option>
                  <option value="Кукуруза">Кукуруза</option>
                  <option value="Подсолнечник">Подсолнечник</option>
                  <option value="Картофель">Картофель</option>
                  <option value="Соя">Соя</option>
                  <option value="Рапс">Рапс</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-black/50 uppercase mb-1">Площадь (га)</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={newField.area_hectares}
                    readOnly
                    className="w-full rounded-xl border-black/10 bg-black/5 font-mono font-bold text-brown-text focus:ring-0 cursor-not-allowed"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-black/40 font-bold">ГА</span>
                </div>
                <p className="text-[10px] text-black/40 mt-1">Рассчитывается автоматически по контуру</p>
              </div>

              <button 
                type="submit"
                className="w-full py-3 bg-gold text-white rounded-xl font-bold shadow-lg shadow-gold/20 hover:bg-amber-warn transition-colors flex items-center justify-center gap-2 mt-4"
              >
                <Check className="w-4 h-4" /> Сохранить поле
              </button>
            </form>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-black/5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
                <input 
                  type="text" 
                  placeholder="Поиск поля..." 
                  className="w-full pl-9 pr-4 py-2 bg-surface-muted rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gold/50"
                />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {fields.map(field => (
                <div 
                  key={field.id}
                  onClick={() => onFieldSelect(field.id)}
                  className="p-3 rounded-xl hover:bg-surface-muted cursor-pointer transition-colors border border-transparent hover:border-black/5 group"
                >
                  <div className="flex justify-between items-start">
                    <h4 className="font-bold text-sm group-hover:text-gold transition-colors">{field.name}</h4>
                    {field.last_analysis?.alert && (
                      <div className="w-2 h-2 rounded-full bg-terra animate-pulse" />
                    )}
                  </div>
                  <p className="text-xs text-black/50 mt-1">{field.crop_type} • {field.area_hectares} га</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-black/5 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-green-leaf" 
                        style={{ width: `${field.last_analysis?.healthy_percent || 0}%` }} 
                      />
                    </div>
                    <span className="text-[10px] font-mono opacity-60">NDVI {field.last_analysis?.ndvi_average.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-black/5">
              <button 
                onClick={() => {
                  setIsAddingField(true);
                }}
                className="w-full py-3 bg-gold text-white rounded-xl font-bold text-sm shadow-lg shadow-gold/20 hover:bg-amber-warn transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" /> Добавить поле
              </button>
            </div>
          </>
        )}
      </div>

      {/* Map Controls */}
      <div className="absolute bottom-8 right-8 z-[1000] bg-white rounded-2xl shadow-lg p-1 flex gap-1">
         {/* place for extra controls if needed */}
      </div>

      {/* Map */}
      <MapContainer 
        center={[51.18, 71.44]} 
        zoom={12} 
        scrollWheelZoom={true} 
        zoomControl={false}
        className="w-full h-full"
      >
        <MapClickHandler onMapClick={handleMapClick} />
        
        <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="Гибрид (Google)">
                <TileLayer
                url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                attribution="Google"
                maxZoom={20}
                />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Спутник (Esri)">
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
        </LayersControl>
        
        {/* Existing Fields */}
        {fields.map(field => (
          <React.Fragment key={field.id}>
            <Marker 
              position={[field.coordinates.lat, field.coordinates.lon]}
              eventHandlers={{
                click: () => onFieldSelect(field.id),
              }}
            >
              <Popup className="custom-popup">
                <div className="p-2">
                  <h3 className="font-bold">{field.name}</h3>
                  <p className="text-xs text-gray-500">{field.crop_type}</p>
                </div>
              </Popup>
            </Marker>
            {/* Render Polygon if exists */}
            {field.polygon && (
               <Polygon 
                 positions={field.polygon} 
                 pathOptions={{ 
                   color: field.last_analysis?.alert ? '#e71408' : '#078812', 
                   fillOpacity: 0.2 
                 }} 
               />
            )}
          </React.Fragment>
        ))}

        {/* Drawing Preview */}
        {isAddingField && (
          <>
            {polygonPoints.length > 0 && (
              <>
                {polygonPoints.map((pos, idx) => (
                  <Marker key={idx} position={pos} opacity={0.6} icon={DefaultIcon} />
                ))}
                <Polyline positions={polygonPoints} pathOptions={{ color: '#e8a917', dashArray: '5, 10' }} />
                {polygonPoints.length > 2 && (
                   <Polygon positions={polygonPoints} pathOptions={{ color: '#e8a917', fillOpacity: 0.1 }} />
                )}
              </>
            )}
          </>
        )}
      </MapContainer>
    </div>
  );
}
