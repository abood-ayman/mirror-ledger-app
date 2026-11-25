import { useCallback, useEffect, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Compass, LocateFixed, MapPin, Search, Sparkles } from 'lucide-react';
import type { Language } from '../types/tracker';

interface FocusSpot {
  id: string;
  name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
}

const DEFAULT_CENTER = { lat: 30.0444, lng: 31.2357 }; // Cairo

const CURATED_SPOTS: FocusSpot[] = [
  {
    id: 'spot_zamalek',
    name: 'Diwan Bookshop & Quiet Corner — Zamalek',
    address: '159 26th of July Corridor, Zamalek, Cairo',
    category: 'Reading & Study',
    lat: 30.0609,
    lng: 31.2197,
  },
  {
    id: 'spot_alazhar',
    name: 'Al-Azhar Park Quiet Terrace',
    address: 'Salah Salem St, Al-Darb Al-Ahmar, Cairo',
    category: 'Outdoor Reflection',
    lat: 30.0407,
    lng: 31.2647,
  },
  {
    id: 'spot_maadi',
    name: 'Maadi Public Library',
    address: 'Rd 9, Maadi, Cairo',
    category: 'Deep Work Library',
    lat: 29.9602,
    lng: 31.2569,
  },
];

interface FocusMapPanelProps {
  lang: Language;
  onAskMapsGrounding: (placeName: string, coords: { latitude: number; longitude: number }) => void;
}

function SpotMarker({
  spot,
  selected,
  onSelect,
  onAskMapsGrounding,
  lang,
}: {
  spot: FocusSpot;
  selected: boolean;
  onSelect: () => void;
  onAskMapsGrounding: (name: string, coords: { latitude: number; longitude: number }) => void;
  lang: Language;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const isAr = lang === 'ar';

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: spot.lat, lng: spot.lng }}
        onClick={onSelect}
        title={spot.name}
      >
        <Pin
          background={selected ? '#FF6B35' : '#00B8A9'}
          borderColor="#0F0F0F"
          glyphColor="#0F0F0F"
        />
      </AdvancedMarker>

      {selected && marker && (
        <InfoWindow anchor={marker} onCloseClick={onSelect}>
          <div className="p-1 max-w-[230px] text-[#0F0F0F] space-y-1.5">
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-[#007B70]">
              {spot.category}
            </div>
            <div className="text-xs font-extrabold leading-snug">{spot.name}</div>
            <div className="text-[11px] text-[#3F3F46] leading-snug">{spot.address}</div>
            <button
              type="button"
              onClick={() =>
                onAskMapsGrounding(spot.name, {
                  latitude: spot.lat,
                  longitude: spot.lng,
                })
              }
              className="mt-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#0F0F0F] text-[#00B8A9] text-[11px] font-bold"
            >
              <Sparkles size={11} />
              <span>{isAr ? 'اسأل نور عنه' : 'Ask Noor about this spot'}</span>
            </button>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function MapInner({ lang, onAskMapsGrounding }: FocusMapPanelProps) {
  const isAr = lang === 'ar';
  const placesLib = useMapsLibrary('places');
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [spots, setSpots] = useState<FocusSpot[]>(CURATED_SPOTS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const selectedSpot = spots.find((s) => s.id === selectedId) ?? null;

  const runPlacesSearch = useCallback(
    async (textQuery: string) => {
      if (!placesLib || !textQuery.trim()) return;
      setSearching(true);
      setSearchError(null);
      try {
        const PlaceClass = placesLib.Place as unknown as {
          searchByText: (req: Record<string, unknown>) => Promise<{
            places?: Array<{
              id?: string;
              displayName?: string;
              formattedAddress?: string;
              primaryTypeDisplayName?: string;
              location?: { lat: () => number; lng: () => number };
            }>;
          }>;
        };
        const { places } = await PlaceClass.searchByText({
          textQuery: textQuery.trim(),
          fields: ['id', 'displayName', 'formattedAddress', 'location', 'primaryTypeDisplayName'],
          locationBias: {
            center,
            radius: 15000,
          },
          maxResultCount: 6,
        });

        const mapped: FocusSpot[] = (places ?? [])
          .filter((p) => p.location)
          .map((p, idx) => ({
            id: p.id || `place_${idx}`,
            name: p.displayName || 'Focus Spot',
            address: p.formattedAddress || '',
            category: p.primaryTypeDisplayName || (isAr ? 'مكان عمل' : 'Workspace'),
            lat: p.location!.lat(),
            lng: p.location!.lng(),
          }));

        if (mapped.length > 0) {
          setSpots(mapped);
          setSelectedId(mapped[0].id);
          setCenter({ lat: mapped[0].lat, lng: mapped[0].lng });
        } else {
          setSearchError(
            isAr ? 'لم يتم العثور على نتائج قريبة.' : 'No matching spots found nearby.'
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/quota|429|RESOURCE_EXHAUSTED/i.test(msg)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded', { detail: { reason: msg } }));
        }
        setSearchError(
          isAr
            ? 'تعذر البحث في الأماكن حالياً — جرب التصفح عبر العلامات المحفوظة.'
            : 'Places search unavailable right now — curated spots remain interactive.'
        );
      } finally {
        setSearching(false);
      }
    },
    [placesLib, center, isAr]
  );

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCenter(next);
      },
      () => {},
      { timeout: 6000 }
    );
  };

  useEffect(() => {
    // Keep map centered smoothly if curated spot picked from list
  }, [selectedSpot]);

  return (
    <div className="space-y-4">
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-4 flex flex-col md:flex-row md:items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runPlacesSearch(query);
          }}
          className="flex-1 flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Search
              size={15}
              className="text-[#71717A] absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                isAr
                  ? 'ابحث عن مكتبة، كافيه هادي، أو مساحة عمل...'
                  : 'Search quiet library, study cafe, or workspace...'
              }
              className="w-full rounded-full bg-[#0F0F0F] border border-[#2A2A2A] ps-10 pe-4 py-2.5 text-sm text-white placeholder-[#71717A] focus:outline-none focus:border-[#00B8A9] min-h-[44px]"
            />
          </div>
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="px-4 py-2.5 rounded-full bg-[#00B8A9] text-[#0F0F0F] text-xs font-extrabold min-h-[44px] whitespace-nowrap disabled:opacity-40"
          >
            {searching ? (isAr ? 'جاري البحث...' : 'Searching...') : isAr ? 'بحث' : 'Search'}
          </button>
        </form>

        <button
          type="button"
          onClick={handleUseMyLocation}
          className="px-3.5 py-2.5 rounded-full bg-[#0F0F0F] border border-[#2A2A2A] hover:border-[#00B8A9] text-xs font-bold text-[#E4E4E7] inline-flex items-center justify-center gap-1.5 min-h-[44px] shrink-0"
        >
          <LocateFixed size={14} className="text-[#00B8A9]" />
          <span>{isAr ? 'موقعي الحالي' : 'My Location'}</span>
        </button>
      </div>

      {searchError && (
        <div className="p-3 rounded-xl bg-[#FF6B35]/10 border border-[#FF6B35]/50 text-xs font-bold text-[#FF6B35]">
          {searchError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div
          data-testid="focus-google-map"
          className="lg:col-span-8 rounded-[20px] overflow-hidden border border-[#2A2A2A] h-[420px] md:h-[480px] bg-[#0F0F0F]"
        >
          <GoogleMap
            mapId="DEMO_MAP_ID"
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            defaultCenter={center}
            center={center}
            defaultZoom={13}
            gestureHandling="greedy"
            disableDefaultUI={false}
            className="w-full h-full"
          >
            {spots.map((spot) => (
              <SpotMarker
                key={spot.id}
                spot={spot}
                selected={selectedId === spot.id}
                onSelect={() =>
                  setSelectedId((prev) => (prev === spot.id ? null : spot.id))
                }
                onAskMapsGrounding={onAskMapsGrounding}
                lang={lang}
              />
            ))}
          </GoogleMap>
        </div>

        <aside className="lg:col-span-4 bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-4 space-y-3 max-h-[480px] overflow-y-auto">
          <div className="flex items-center gap-2 text-xs font-extrabold text-white">
            <Compass size={15} className="text-[#00B8A9]" />
            <span>{isAr ? 'أماكن مقترحة للتركيز' : 'Focus Locations'}</span>
          </div>

          <div className="space-y-2">
            {spots.map((spot) => {
              const active = selectedId === spot.id;
              return (
                <button
                  key={spot.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(spot.id);
                    setCenter({ lat: spot.lat, lng: spot.lng });
                  }}
                  className="w-full text-start p-3 rounded-xl border transition space-y-1"
                  style={{
                    backgroundColor: active ? '#00B8A918' : '#0F0F0F',
                    borderColor: active ? '#00B8A9' : '#2A2A2A',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-extrabold text-[#00B8A9]">
                      {spot.category}
                    </span>
                    <MapPin size={12} className="text-[#71717A]" />
                  </div>
                  <div className="text-xs font-extrabold text-white leading-snug">
                    {spot.name}
                  </div>
                  <div className="text-[11px] text-[#A1A1AA] line-clamp-2">
                    {spot.address}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}

export function FocusMapPanel({ lang, onAskMapsGrounding }: FocusMapPanelProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
  const isAr = lang === 'ar';

  if (!apiKey) {
    return (
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-[20px] p-6 text-center space-y-2">
        <MapPin size={24} className="mx-auto text-[#FF6B35]" />
        <p className="text-sm font-extrabold text-white">
          {isAr ? 'مفتاح خرائط جوجل غير متاح' : 'Google Maps API key unavailable'}
        </p>
        <p className="text-xs text-[#A1A1AA]">
          {isAr
            ? 'يرجى التأكد من تفعيل مفتاح Google Maps في إعدادات البيئة.'
            : 'Please ensure Google Maps is configured in your environment.'}
        </p>
      </div>
    );
  }

  return (
    <APIProvider
      apiKey={apiKey}
      language={lang}
      region={lang === 'ar' ? 'EG' : 'US'}
    >
      <MapInner lang={lang} onAskMapsGrounding={onAskMapsGrounding} />
    </APIProvider>
  );
}
