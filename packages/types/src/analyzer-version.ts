// Provenance.analyzerVersion 기준값. cli/extension 모두 이 상수를 사용해야
// CLI 캐시가 extension에서 무효화되지 않는다 (cache key의 일부).
// **새 버전 publish 시 반드시 갱신**: packages/extension/package.json version과 동기화.
export const ANALYZER_VERSION = 'codebase-viz@1.2.46'
