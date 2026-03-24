// =====================================================
// 식당 API 엔드포인트
// 1순위: Google Places API (실제 데이터)
// 2순위: Mock 데이터 (폴백)
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { MOCK_RESTAURANTS, calculateDistance } from '@/lib/mockData'
import { Restaurant } from '@/lib/types'

// Google Places 카테고리 → 앱 카테고리 변환
function mapGoogleType(types: string[]): string {
  if (types.includes('japanese_restaurant') || types.some(t => t.includes('sushi') || t.includes('ramen'))) return '일식'
  if (types.includes('chinese_restaurant')) return '중식'
  if (types.includes('korean_restaurant')) return '한식'
  if (types.includes('italian_restaurant') || types.includes('french_restaurant') || types.includes('steak_house')) return '양식'
  if (types.includes('cafe') || types.includes('coffee_shop') || types.includes('bakery')) return '카페'
  if (types.includes('fast_food_restaurant') || types.includes('hamburger_restaurant')) return '패스트푸드'
  if (types.includes('meal_takeaway') || types.includes('meal_delivery')) return '분식'
  return '기타'
}

// Google price_level (0~4) → 앱 가격대 변환
function mapPriceLevel(level?: number): { range: 'cheap' | 'moderate' | 'expensive'; min: number; avg: number } {
  if (level === undefined || level <= 1) return { range: 'cheap', min: 5000, avg: 7000 }
  if (level === 2) return { range: 'moderate', min: 10000, avg: 15000 }
  return { range: 'expensive', min: 20000, avg: 30000 }
}

// Google Places Nearby Search
async function searchGooglePlacesNearby(
  lat: number,
  lng: number,
  keyword: string,
  radius = 1500
): Promise<any[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return []

  try {
    const params = new URLSearchParams({
      location: `${lat},${lng}`,
      radius: String(radius),
      type: 'restaurant',
      keyword,
      language: 'ko',
      key: apiKey,
    })
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params}`
    )
    if (!res.ok) return []
    const data = await res.json()
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('Google Places Nearby 오류:', data.status, data.error_message)
    }
    return data.results || []
  } catch (e) {
    console.error('Google Places Nearby 요청 실패:', e)
    return []
  }
}

// Google Places Text Search (지역명 검색용)
async function searchGooglePlacesText(query: string, lat?: number, lng?: number): Promise<any[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return []

  try {
    const params = new URLSearchParams({
      query,
      type: 'restaurant',
      language: 'ko',
      region: 'kr',
      key: apiKey,
    })
    if (lat && lng) params.set('location', `${lat},${lng}`)

    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`
    )
    if (!res.ok) return []
    const data = await res.json()
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('Google Places Text 오류:', data.status, data.error_message)
    }
    return data.results || []
  } catch (e) {
    console.error('Google Places Text 요청 실패:', e)
    return []
  }
}

// Google Geocoding API (지역명 → 좌표)
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return null

  try {
    const params = new URLSearchParams({
      address,
      language: 'ko',
      region: 'kr',
      key: apiKey,
    })
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${params}`
    )
    if (!res.ok) return null
    const data = await res.json()
    if (data.status !== 'OK' || !data.results[0]) return null
    const loc = data.results[0].geometry.location
    return { lat: loc.lat, lng: loc.lng }
  } catch {
    return null
  }
}

// 한국 시간 기준 영업 중 추정 (09:00~22:00)
function estimateIsOpen(): boolean {
  const kstHour = (new Date().getUTCHours() + 9) % 24
  return kstHour >= 9 && kstHour < 22
}

// Google Places 결과 → Restaurant 타입
function mapGooglePlace(place: any, idx: number, userLat: number, userLng: number): Restaurant {
  const placeLat = place.geometry.location.lat
  const placeLng = place.geometry.location.lng
  const distance = calculateDistance(userLat, userLng, placeLat, placeLng)
  const category = mapGoogleType(place.types || [])
  const priceInfo = mapPriceLevel(place.price_level)

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  const thumbnail = place.photos?.[0]?.photo_reference && apiKey
    ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${place.photos[0].photo_reference}&key=${apiKey}`
    : ''

  return {
    id: `google-${place.place_id || idx}`,
    name: place.name,
    category: category as any,
    address: place.vicinity || place.formatted_address || '',
    phone: '',
    location: { lat: placeLat, lng: placeLng },
    soloFriendly: true,
    hasSoloSeat: false,
    avgPrice: priceInfo.avg,
    minPrice: priceInfo.min,
    priceRange: priceInfo.range,
    rating: place.rating || 0,
    reviewCount: place.user_ratings_total || 0,
    openTime: '09:00',
    closeTime: '22:00',
    isOpen: place.opening_hours?.open_now ?? estimateIsOpen(),
    closedDays: [],
    thumbnail,
    images: [],
    menus: [],
    tags: (place.types || []).slice(0, 3),
    naverMapUrl: '',
    distance,
  }
}

// GET /api/restaurants
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const lat = parseFloat(searchParams.get('lat') || '37.4979')
  const lng = parseFloat(searchParams.get('lng') || '127.0276')
  const isOpen = searchParams.get('isOpen') === 'true'
  const categories = searchParams.get('categories')?.split(',').filter(Boolean) || []
  const searchQuery = searchParams.get('q') || ''

  const apiKey = process.env.GOOGLE_MAPS_API_KEY

  if (apiKey) {
    try {
      let allPlaces: any[] = []
      const seen = new Set<string>()

      if (searchQuery) {
        // 지역명/키워드 검색: Geocoding 후 Nearby Search
        const geocoded = await geocodeAddress(searchQuery)
        const searchLat = geocoded?.lat ?? lat
        const searchLng = geocoded?.lng ?? lng

        const results = await searchGooglePlacesNearby(searchLat, searchLng, '혼밥 식당', 2000)
        for (const p of results) {
          if (p.place_id && !seen.has(p.place_id)) {
            seen.add(p.place_id)
            allPlaces.push(p)
          }
        }
      } else {
        // 기본: 현재 위치 주변 혼밥 가능 식당 검색
        const keywords = categories.length > 0
          ? categories.map(c => `${c} 식당`)
          : ['혼밥 식당', '1인 식당']

        for (const kw of keywords) {
          const results = await searchGooglePlacesNearby(lat, lng, kw, 2000)
          for (const p of results) {
            if (p.place_id && !seen.has(p.place_id)) {
              seen.add(p.place_id)
              allPlaces.push(p)
            }
          }
        }
      }

      let restaurants: Restaurant[] = allPlaces
        .filter(p => p.geometry?.location)
        .map((p, idx) => mapGooglePlace(p, idx, lat, lng))

      // 거리순 정렬 후 30개
      restaurants.sort((a, b) => (a.distance ?? 99999) - (b.distance ?? 99999))
      restaurants = restaurants.slice(0, 30)

      if (isOpen) restaurants = restaurants.filter(r => r.isOpen)

      return NextResponse.json({
        restaurants,
        total: restaurants.length,
        source: 'google',
      })
    } catch (error) {
      console.error('Google Places 검색 실패:', error)
    }
  }

  // 폴백: Mock 데이터
  const mock = MOCK_RESTAURANTS.map(r => ({
    ...r,
    distance: calculateDistance(lat, lng, r.location.lat, r.location.lng),
  }))
  mock.sort((a, b) => (a.distance || 0) - (b.distance || 0))
  return NextResponse.json({ restaurants: mock, total: mock.length, source: 'mock' })
}
