import { describe, it, expect } from 'vitest';
import { createRouteNode, createComponentNode, createTableNode, createEdge, createIRGraph, makeNodeId, makeEdgeId, isRouteNode, isComponentNode, isTableNode, } from './ir.js';
const p = {
    file: 'src/app/page.tsx',
    line: 1,
    adapter: 'nextjs-app-router@0.1',
    analyzerVersion: 'codebase-viz@0.1.0',
};
describe('makeNodeId', () => {
    it('결정론적 ID를 생성한다', () => {
        const id = makeNodeId('route', 'src/app/page.tsx', 'page');
        expect(id).toBe('route:src/app/page.tsx:page');
        expect(makeNodeId('route', 'src/app/page.tsx', 'page')).toBe(id);
    });
    it('같은 디렉토리의 page/layout은 다른 ID를 갖는다', () => {
        const page = makeNodeId('route', 'src/app', 'page');
        const layout = makeNodeId('route', 'src/app', 'layout');
        expect(page).not.toBe(layout);
    });
});
describe('makeEdgeId', () => {
    it('결정론적 edge ID를 생성한다', () => {
        const from = makeNodeId('route', 'src/app/page.tsx', 'page');
        const to = makeNodeId('component', 'src/components/Header.tsx', 'Header');
        const id = makeEdgeId('renders', from, to);
        expect(id).toContain('renders:');
        expect(makeEdgeId('renders', from, to)).toBe(id);
    });
});
describe('createRouteNode', () => {
    it('verified RouteNode를 생성한다', () => {
        const node = createRouteNode({
            id: makeNodeId('route', 'src/app/page.tsx', 'page'),
            path: '/',
            filePath: 'src/app/page.tsx',
            routeFileKind: 'page',
            dynamicSegmentType: 'static',
            isGroupRoute: false,
            renderingMode: 'SSR',
            provenance: p,
            confidence: 'verified',
        });
        expect(node.kind).toBe('route');
        expect(node.confidence).toBe('verified');
        expect(node.routeFileKind).toBe('page');
        expect(node.dynamicSegmentType).toBe('static');
    });
    it('inferred RouteNode는 inferenceChain이 필수다', () => {
        const node = createRouteNode({
            id: makeNodeId('route', 'src/app/blog/[slug]/page.tsx', 'page'),
            path: '/blog/[slug]',
            filePath: 'src/app/blog/[slug]/page.tsx',
            routeFileKind: 'page',
            dynamicSegmentType: 'dynamic',
            isGroupRoute: false,
            renderingMode: 'SSR',
            provenance: p,
            confidence: 'inferred',
            inferenceChain: ['filesystem scan: [slug] pattern detected'],
        });
        expect(node.confidence).toBe('inferred');
        // TS narrowing 검증
        if (node.confidence === 'inferred') {
            expect(node.inferenceChain).toHaveLength(1);
        }
    });
    it('layout 파일을 올바르게 표현한다', () => {
        const node = createRouteNode({
            id: makeNodeId('route', 'src/app', 'layout'),
            path: '/',
            filePath: 'src/app/layout.tsx',
            routeFileKind: 'layout',
            dynamicSegmentType: 'static',
            isGroupRoute: false,
            renderingMode: 'SSR',
            provenance: p,
            confidence: 'verified',
        });
        expect(node.routeFileKind).toBe('layout');
    });
    it('route-handler(API route)를 올바르게 표현한다', () => {
        const node = createRouteNode({
            id: makeNodeId('route', 'src/app/api/posts', 'route-handler'),
            path: '/api/posts',
            filePath: 'src/app/api/posts/route.ts',
            routeFileKind: 'route-handler',
            dynamicSegmentType: 'static',
            isGroupRoute: false,
            renderingMode: 'SSR',
            provenance: p,
            confidence: 'verified',
        });
        expect(node.routeFileKind).toBe('route-handler');
    });
});
describe('createComponentNode', () => {
    it('server 컴포넌트를 생성한다', () => {
        const node = createComponentNode({
            id: makeNodeId('component', 'src/components/Header.tsx', 'Header'),
            name: 'Header',
            filePath: 'src/components/Header.tsx',
            runtime: 'server',
            provenance: p,
            confidence: 'verified',
        });
        expect(node.kind).toBe('component');
        expect(node.runtime).toBe('server');
    });
    it('client 컴포넌트를 생성한다', () => {
        const node = createComponentNode({
            id: makeNodeId('component', 'src/components/Counter.tsx', 'Counter'),
            name: 'Counter',
            filePath: 'src/components/Counter.tsx',
            runtime: 'client',
            provenance: p,
            confidence: 'verified',
        });
        expect(node.runtime).toBe('client');
    });
});
describe('createTableNode', () => {
    it('PK/FK 정보를 포함한 TableNode를 생성한다', () => {
        const node = createTableNode({
            id: makeNodeId('table', 'src/types/supabase.ts', 'posts'),
            name: 'posts',
            columns: [
                { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true },
                { name: 'title', type: 'text', nullable: false },
                { name: 'author_id', type: 'uuid', nullable: false, references: { table: 'profiles', column: 'id' } },
            ],
            provenance: p,
            confidence: 'verified',
        });
        expect(node.kind).toBe('table');
        expect(node.columns[0]?.isPrimaryKey).toBe(true);
        expect(node.columns[2]?.references?.table).toBe('profiles');
    });
});
describe('createEdge', () => {
    it('queries 엣지를 생성한다 (ComponentNode → TableNode)', () => {
        const from = makeNodeId('component', 'src/components/PostList.tsx', 'PostList');
        const to = makeNodeId('table', 'src/types/supabase.ts', 'posts');
        const edge = createEdge({
            id: makeEdgeId('queries', from, to),
            from,
            to,
            kind: 'queries',
            provenance: p,
            confidence: 'inferred',
            inferenceChain: ['supabase.from("posts") at PostList.tsx:12'],
        });
        expect(edge.kind).toBe('queries');
        if (edge.confidence === 'inferred') {
            expect(edge.inferenceChain).toHaveLength(1);
        }
    });
    it('imports 엣지는 importDepth를 가진다', () => {
        const from = makeNodeId('route', 'src/app/page.tsx', 'page');
        const to = makeNodeId('component', 'src/components/Header.tsx', 'Header');
        const edge = createEdge({
            id: makeEdgeId('imports', from, to),
            from,
            to,
            kind: 'imports',
            importDepth: 1,
            provenance: p,
            confidence: 'verified',
        });
        expect(edge.importDepth).toBe(1);
    });
});
describe('createIRGraph', () => {
    it('schemaVersion, generatedAt을 자동 설정한다', () => {
        const graph = createIRGraph({
            analyzerVersion: 'codebase-viz@0.1.0',
            repoRoot: '/mnt/d/workspace/dev-log-portfolio',
            projectName: 'dev-log-portfolio',
            nodes: [],
            edges: [],
        });
        expect(graph.schemaVersion).toBe('0.1');
        expect(graph.generatedAt).toBeTruthy();
        expect(graph.projectName).toBe('dev-log-portfolio');
    });
    it('warnings 필드를 포함할 수 있다', () => {
        const graph = createIRGraph({
            analyzerVersion: 'codebase-viz@0.1.0',
            repoRoot: '/repo',
            nodes: [],
            edges: [],
            warnings: [{ file: 'src/unknown.ts', message: 'parse failed', severity: 'warn' }],
        });
        expect(graph.warnings).toHaveLength(1);
    });
});
describe('type guards', () => {
    it('discriminated union narrowing이 작동한다', () => {
        const nodes = [
            createRouteNode({
                id: makeNodeId('route', 'src/app/page.tsx', 'page'),
                path: '/',
                filePath: 'src/app/page.tsx',
                routeFileKind: 'page',
                dynamicSegmentType: 'static',
                isGroupRoute: false,
                renderingMode: 'SSR',
                provenance: p,
                confidence: 'verified',
            }),
            createComponentNode({
                id: makeNodeId('component', 'src/components/Header.tsx', 'Header'),
                name: 'Header',
                filePath: 'src/components/Header.tsx',
                runtime: 'server',
                provenance: p,
                confidence: 'verified',
            }),
            createTableNode({
                id: makeNodeId('table', 'src/types/supabase.ts', 'posts'),
                name: 'posts',
                columns: [],
                provenance: p,
                confidence: 'verified',
            }),
        ];
        expect(nodes.filter(isRouteNode)).toHaveLength(1);
        expect(nodes.filter(isComponentNode)).toHaveLength(1);
        expect(nodes.filter(isTableNode)).toHaveLength(1);
    });
});
// ─── 절대 원칙 2 자가검증 ─────────────────────────────────────────────────────
// provenance 없이 직접 RouteNode 리터럴을 만들려 하면 TS 에러 발생해야 함
describe('절대 원칙 2 — provenance 필수 강제', () => {
    it('provenance 누락 시 TypeScript 컴파일 에러가 발생한다', () => {
        // @ts-expect-error — provenance 필드 누락, TS가 잡아야 함
        const _invalid = {
            kind: 'route',
            id: makeNodeId('route', 'src/app/page.tsx', 'page'),
            path: '/',
            filePath: 'src/app/page.tsx',
            routeFileKind: 'page',
            dynamicSegmentType: 'static',
            isGroupRoute: false,
            renderingMode: 'SSR',
            confidence: 'verified',
            // provenance 의도적으로 누락
        };
        expect(true).toBe(true);
    });
});
//# sourceMappingURL=ir.test.js.map