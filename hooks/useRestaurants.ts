'use client'

import { useState, useEffect, useRef } from 'react'
import { Restaurant, FilterOptions, LatLng } from '@/lib/types'
import { calculateDistance } from '@/lib/mockData'

export function useRestaurants(
  filters: FilterOptions,
  userLocation: LatLng | null,
  searchCenter?: LatLng | null
) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [loading, setLoading] = useState(true)

  // onMarkerClick stale closure 방지와 동일한 패턴: filters를 직렬화해 안정적인 비교
  const filtersKey = JSON.stringify(filters)

  useEffect(() => {
    // AbortController: 빠른 필터 변경 시 이전 요청 취소 (race condition 방지)
    const controller = new AbortController()
    let cancelled = false

    const fetchData = async () => {
      setLoading(true)
      try {
        const lat = searchCenter?.lat ?? userLocation?.lat ?? 37.4979
        const lng = searchCenter?.lng ?? userLocation?.lng ?? 127.0276

        const params = new URLSearchParams({
          lat: String(lat),
          lng: String(lng),
          soloFriendly: String(filters.soloFriendly),
          hasSoloSeat: String(filters.hasSoloSeat),
          isOpen: String(filters.isOpen),
        })
        if (filters.categories.length > 0) params.set('categories', filters.categories.join(','))
        if (filters.priceRanges.length > 0) params.set('priceRanges', filters.priceRanges.join(','))
        if (filters.searchQuery) params.set('q', filters.searchQuery)

        const res = await fetch(`/api/restaurants?${params}`, { signal: controller.signal })
        if (!res.ok) throw new Error('API 응답 오류')
        const data = await res.json()

        if (cancelled) return

        let result: Restaurant[] = (data.restaurants || []).map((r: Restaurant) => ({
          ...r,
          distance: calculateDistance(lat, lng, r.location.lat, r.location.lng),
        }))

        // 클라이언트 사이드 필터 적용
        if (filters.categories.length > 0) {
          result = result.filter(r => filters.categories.includes(r.category))
        }
        if (filters.priceRanges.length > 0) {
          result = result.filter(r => filters.priceRanges.includes(r.priceRange))
        }
        if (filters.soloFriendly) {
          result = result.filter(r => r.soloFriendly)
        }
        if (filters.hasSoloSeat) {
          result = result.filter(r => r.hasSoloSeat)
        }
        if (filters.isOpen) {
          result = result.filter(r => r.isOpen)
        }
        if (filters.maxDistance > 0) {
          result = result.filter(r => r.distance !== undefined && r.distance <= filters.maxDistance)
        }
        if (filters.minRating > 0) {
          result = result.filter(r => r.rating >= filters.minRating)
        }

        result.sort((a, b) => {
          switch (filters.sortBy) {
            case 'distance':
              if (a.distance === undefined) return 1
              if (b.distance === undefined) return -1
              return a.distance - b.distance
            case 'rating':
              return b.rating - a.rating
            case 'price_asc':
              return a.minPrice - b.minPrice
            case 'price_desc':
              return b.avgPrice - a.avgPrice
            case 'review':
              return b.reviewCount - a.reviewCount
            default:
              return 0
          }
        })

        setRestaurants(result)
      } catch (e: any) {
        if (e?.name === 'AbortError') return  // 요청 취소는 정상 케이스
        console.error('식당 데이터 불러오기 실패:', e)
        if (!cancelled) setRestaurants([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()

    return () => {
      cancelled = true
      controller.abort()
    }
  // filtersKey로 안정적인 의존성 비교, 위치는 좌표값 기준
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, userLocation?.lat, userLocation?.lng, searchCenter?.lat, searchCenter?.lng])

  return {
    restaurants,
    total: restaurants.length,
    hasResults: restaurants.length > 0,
    loading,
  }
}
