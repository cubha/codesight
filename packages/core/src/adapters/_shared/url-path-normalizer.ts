// Converts framework-specific dynamic segment notation to unified :param format.
// Policy: [slug]→:slug, [...slug]→:slug*, [[...slug]]→:slug?, {slug}→:slug
export function normalizeSegment(segment: string): string {
  // Optional catch-all: [[...slug]] → :slug?
  if (segment.startsWith('[[...') && segment.endsWith(']]')) {
    return ':' + segment.slice(5, -2) + '?'
  }
  // Catch-all: [...slug] → :slug*
  if (segment.startsWith('[...') && segment.endsWith(']')) {
    return ':' + segment.slice(4, -1) + '*'
  }
  // Dynamic: [slug] → :slug
  if (segment.startsWith('[') && segment.endsWith(']')) {
    return ':' + segment.slice(1, -1)
  }
  // Path param (Django/FastAPI/Spring): {id} → :id
  if (segment.startsWith('{') && segment.endsWith('}')) {
    return ':' + segment.slice(1, -1)
  }
  return segment
}

export function normalizeUrlPath(rawPath: string): string {
  if (rawPath === '' || rawPath === '/') return '/'
  const segments = rawPath.split('/')
  return segments.map(s => normalizeSegment(s)).join('/')
}

// 정규화된 URL path가 `:param` 형태의 dynamic segment를 포함하는지 판정.
// normalizeUrlPath() 통과 후 사용. BE 어댑터(fastapi/nestjs/springboot) 전용.
export function getDynamicSegmentType(urlPath: string): 'dynamic' | 'static' {
  return urlPath.includes(':') ? 'dynamic' : 'static'
}

// File-based FE 어댑터(nextjs/sveltekit) segments[] 기반 4-variant 판정.
// Priority: optional-catch-all > catch-all > dynamic > static.
export function getDynamicSegmentTypeFromSegments(
  segments: string[],
): 'static' | 'dynamic' | 'catch-all' | 'optional-catch-all' {
  if (segments.some(s => s.startsWith('[[...'))) return 'optional-catch-all'
  if (segments.some(s => s.startsWith('[...'))) return 'catch-all'
  if (segments.some(s => s.startsWith('['))) return 'dynamic'
  return 'static'
}
