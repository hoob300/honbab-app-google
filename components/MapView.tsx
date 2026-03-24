'use client'

import { useEffect, useRef, useState } from 'react'
import { Restaurant, LatLng } from '@/lib/types'

declare global {
  interface Window {
    google: any
    initGoogleMap?: () => void
  }
}

interface MapViewProps {
  restaurants: Restaurant[]
  userLocation: LatLng | null
  selectedRestaurant: Restaurant | null
  onMarkerClick: (restaurant: Restaurant) => void
  favorites: string[]
  searchCenter?: LatLng | null
}

export function MapView({
  restaurants,
  userLocation,
  selectedRestaurant,
  onMarkerClick,
  favorites,
  searchCenter,
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const markersRef = useRef<Map<string, any>>(new Map())
  const myLocationMarkerRef = useRef<any>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [scriptError, setScriptError] = useState(false)

  // ── Google Maps 스크립트 로드 ──
  useEffect(() => {
    if (window.google?.maps) {
      setMapLoaded(true)
      return
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!apiKey || apiKey.startsWith('YOUR_')) {
      setScriptError(true)
      return
    }

    window.initGoogleMap = () => setMapLoaded(true)

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initGoogleMap&language=ko&region=KR`
    script.async = true
    script.defer = true
    script.onerror = () => setScriptError(true)
    document.head.appendChild(script)

    return () => {
      if (document.head.contains(script)) document.head.removeChild(script)
      delete window.initGoogleMap
    }
  }, [])

  // ── 지도 초기화 ──
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || mapInstance.current) return

    const center = userLocation || { lat: 37.4979, lng: 127.0276 }

    try {
      mapInstance.current = new window.google.maps.Map(mapRef.current, {
        center: { lat: center.lat, lng: center.lng },
        zoom: 15,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
        zoomControlOptions: {
          position: window.google.maps.ControlPosition.RIGHT_TOP,
        },
      })
    } catch (e) {
      console.error('지도 초기화 실패:', e)
      setScriptError(true)
    }
  }, [mapLoaded, userLocation])

  // ── 현재 위치로 지도 이동 ──
  useEffect(() => {
    if (!mapInstance.current || !userLocation) return
    mapInstance.current.panTo({ lat: userLocation.lat, lng: userLocation.lng })
  }, [userLocation])

  // ── 검색 지역으로 지도 이동 ──
  useEffect(() => {
    if (!mapInstance.current || !searchCenter) return
    mapInstance.current.panTo({ lat: searchCenter.lat, lng: searchCenter.lng })
    mapInstance.current.setZoom(14)
  }, [searchCenter])

  // ── 내 위치 마커 ──
  useEffect(() => {
    if (!mapLoaded || !mapInstance.current || !userLocation) return

    if (myLocationMarkerRef.current) {
      myLocationMarkerRef.current.setMap(null)
    }

    myLocationMarkerRef.current = new window.google.maps.Marker({
      position: { lat: userLocation.lat, lng: userLocation.lng },
      map: mapInstance.current,
      title: '내 위치',
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        fillColor: '#4285f4',
        fillOpacity: 1,
        strokeColor: 'white',
        strokeWeight: 3,
        scale: 10,
      },
      zIndex: 9999,
    })
  }, [mapLoaded, userLocation])

  // ── 식당 마커들 ──
  useEffect(() => {
    if (!mapLoaded || !mapInstance.current) return

    markersRef.current.forEach(marker => marker.setMap(null))
    markersRef.current.clear()

    restaurants.forEach(restaurant => {
      const isSelected = selectedRestaurant?.id === restaurant.id
      const isFav = favorites.includes(restaurant.id)
      const isSolo = restaurant.soloFriendly || restaurant.hasSoloSeat

      const fillColor = isSelected ? '#15803d'
        : isFav ? '#ef4444'
        : isSolo ? '#22c55e'
        : '#64748b'

      const emoji = isFav ? '❤' : isSolo ? '🍽' : '📍'
      const priceText = `${(restaurant.minPrice / 1000).toFixed(0)}천~`

      // SVG 커스텀 마커
      const width = isSelected ? 88 : 80
      const height = isSelected ? 44 : 40
      const svgMarker = encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
          <rect x="2" y="2" width="${width - 4}" height="28" rx="14" fill="${fillColor}" stroke="white" stroke-width="2"/>
          <text x="${width / 2}" y="19" text-anchor="middle" fill="white" font-size="11" font-weight="bold" font-family="sans-serif">${emoji} ${priceText}</text>
          <polygon points="${width / 2 - 6},30 ${width / 2 + 6},30 ${width / 2},${height - 2}" fill="${fillColor}"/>
        </svg>
      `)

      const marker = new window.google.maps.Marker({
        position: { lat: restaurant.location.lat, lng: restaurant.location.lng },
        map: mapInstance.current,
        title: restaurant.name,
        icon: {
          url: `data:image/svg+xml,${svgMarker}`,
          scaledSize: new window.google.maps.Size(width, height),
          anchor: new window.google.maps.Point(width / 2, height),
        },
        zIndex: isSelected ? 1000 : 1,
      })

      marker.addListener('click', () => {
        onMarkerClick(restaurant)
        mapInstance.current.panTo({
          lat: restaurant.location.lat,
          lng: restaurant.location.lng,
        })
      })

      markersRef.current.set(restaurant.id, marker)
    })
  }, [mapLoaded, restaurants, selectedRestaurant, favorites, onMarkerClick])

  // ── API 키 없을 때 안내 ──
  if (scriptError) {
    return (
      <div className="w-full h-full bg-gray-100 flex flex-col items-center justify-center p-6 relative">
        <div className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: 'linear-gradient(#ccc 1px, transparent 1px), linear-gradient(90deg, #ccc 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        <div className="relative z-10 bg-white rounded-2xl p-6 shadow-lg text-center max-w-sm">
          <div className="text-4xl mb-3">🗺</div>
          <h3 className="font-bold text-gray-800 mb-2">Google Maps API 키 필요</h3>
          <p className="text-sm text-gray-600 mb-4 leading-relaxed">
            Google Cloud Console에서 API 키를 발급받아
            <code className="bg-gray-100 px-1 rounded mx-1">.env.local</code>에 설정해주세요.
          </p>
          <div className="bg-gray-50 rounded-lg p-3 text-left text-xs font-mono text-gray-600 space-y-1">
            <p className="text-gray-400"># .env.local</p>
            <p>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...</p>
            <p>GOOGLE_MAPS_API_KEY=AIza...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />

      {!mapLoaded && (
        <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">지도 불러오는 중...</p>
          </div>
        </div>
      )}

      {userLocation && mapInstance.current && (
        <button
          onClick={() => {
            mapInstance.current?.panTo({ lat: userLocation.lat, lng: userLocation.lng })
            mapInstance.current?.setZoom(15)
          }}
          className="absolute bottom-6 right-4 z-10 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors border border-gray-200"
          title="내 위치로 이동"
        >
          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      )}
    </div>
  )
}
