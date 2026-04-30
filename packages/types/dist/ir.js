// ─── Factory functions ────────────────────────────────────────────────────────
// Recommended way to create nodes and edges — `kind` is injected automatically.
// Note: the interfaces are exported for type annotations, but factories are the
// preferred construction path as they enforce `kind` at the call site.
export function createRouteNode(params) {
    return { kind: 'route', ...params };
}
export function createComponentNode(params) {
    return { kind: 'component', ...params };
}
export function createTableNode(params) {
    return { kind: 'table', ...params };
}
export function createEdge(params) {
    return { ...params };
}
export function createIRGraph(params) {
    return {
        schemaVersion: '0.1',
        generatedAt: new Date().toISOString(),
        ...params,
    };
}
// ─── Type guards ──────────────────────────────────────────────────────────────
export function isRouteNode(node) {
    return node.kind === 'route';
}
export function isComponentNode(node) {
    return node.kind === 'component';
}
export function isTableNode(node) {
    return node.kind === 'table';
}
// ─── NodeId / EdgeId builders ─────────────────────────────────────────────────
// Symbol convention per kind:
//   RouteNode    → symbol = routeFileKind  (e.g. 'page', 'layout', 'route-handler')
//                  Prevents NodeId collision when page.tsx and layout.tsx share a directory.
//   ComponentNode → symbol = exported identifier (default export → filename stem)
//   TableNode    → symbol = table name
//
// Full format: "${kind}:${repoRelativePath}:${symbol}"
// Deterministic — same input always yields the same ID. UUID is forbidden.
export function makeNodeId(kind, repoRelativePath, symbol) {
    return `${kind}:${repoRelativePath}:${symbol}`;
}
export function makeEdgeId(kind, from, to) {
    return `${kind}:${from}:${to}`;
}
//# sourceMappingURL=ir.js.map