import * as path from 'node:path'

// 파일 경로에서 컴포넌트 이름 추출. 확장자 제거. nextjs/nextjs-pages/remix/sveltekit/nuxt/vue-spa 공통.
export function componentNameFromPath(filePath: string): string {
  return path.basename(filePath, path.extname(filePath))
}
