// Google Places Photo 프록시 API
// 서버 API 키를 클라이언트에 노출하지 않고 사진을 제공합니다
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get('ref')
  const apiKey = process.env.GOOGLE_MAPS_API_KEY

  if (!ref || !apiKey) {
    return new NextResponse(null, { status: 400 })
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${encodeURIComponent(ref)}&key=${apiKey}`
    const res = await fetch(url)

    if (!res.ok) {
      return new NextResponse(null, { status: res.status })
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg'
    const buffer = await res.arrayBuffer()

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',  // 24시간 캐시
      },
    })
  } catch {
    return new NextResponse(null, { status: 500 })
  }
}
