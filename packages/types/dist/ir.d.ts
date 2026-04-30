export type NodeId = string & {
    readonly __brand: 'NodeId';
};
export type EdgeId = string & {
    readonly __brand: 'EdgeId';
};
export interface Provenance {
    file: string;
    line: number;
    adapter: string;
    analyzerVersion: string;
}
export type ConfidenceInfo = {
    confidence: 'verified' | 'manual';
} | {
    confidence: 'inferred';
    inferenceChain: string[];
};
export type RouteFileKind = 'page' | 'layout' | 'loading' | 'error' | 'template' | 'not-found' | 'route-handler';
export type DynamicSegmentType = 'static' | 'dynamic' | 'catch-all' | 'optional-catch-all';
type RouteNodeBase = {
    kind: 'route';
    id: NodeId;
    path: string;
    filePath: string;
    routeFileKind: RouteFileKind;
    dynamicSegmentType: DynamicSegmentType;
    isGroupRoute: boolean;
    renderingMode: RenderingMode;
    provenance: Provenance;
};
export type RenderingMode = 'SSR' | 'SSG' | 'ISR' | 'CSR' | 'PPR' | 'unknown';
export type RouteNode = RouteNodeBase & ConfidenceInfo;
export type ComponentRuntime = 'client' | 'server' | 'shared' | 'unknown';
type ComponentNodeBase = {
    kind: 'component';
    id: NodeId;
    name: string;
    filePath: string;
    runtime: ComponentRuntime;
    provenance: Provenance;
};
export type ComponentNode = ComponentNodeBase & ConfidenceInfo;
type TableNodeBase = {
    kind: 'table';
    id: NodeId;
    name: string;
    columns: ColumnDef[];
    provenance: Provenance;
};
export interface ColumnDef {
    name: string;
    type: string;
    nullable: boolean;
    isPrimaryKey?: boolean;
    references?: {
        table: string;
        column: string;
    };
}
export type TableNode = TableNodeBase & ConfidenceInfo;
export type IRNode = RouteNode | ComponentNode | TableNode;
export type EdgeKind = 'renders' | 'calls' | 'queries' | 'imports';
type IREdgeBase = {
    id: EdgeId;
    from: NodeId;
    to: NodeId;
    kind: EdgeKind;
    importDepth?: number;
    provenance: Provenance;
};
export type IREdge = IREdgeBase & ConfidenceInfo;
export interface IRGraph {
    schemaVersion: '0.1';
    analyzerVersion: string;
    repoRoot: string;
    projectName?: string;
    generatedAt: string;
    nodes: IRNode[];
    edges: IREdge[];
    warnings?: Array<{
        file: string;
        message: string;
        severity: 'warn' | 'error';
    }>;
}
export declare function createRouteNode(params: Omit<RouteNodeBase, 'kind'> & ConfidenceInfo): RouteNode;
export declare function createComponentNode(params: Omit<ComponentNodeBase, 'kind'> & ConfidenceInfo): ComponentNode;
export declare function createTableNode(params: Omit<TableNodeBase, 'kind'> & ConfidenceInfo): TableNode;
export declare function createEdge(params: IREdgeBase & ConfidenceInfo): IREdge;
export declare function createIRGraph(params: Omit<IRGraph, 'schemaVersion' | 'generatedAt'>): IRGraph;
export declare function isRouteNode(node: IRNode): node is RouteNode;
export declare function isComponentNode(node: IRNode): node is ComponentNode;
export declare function isTableNode(node: IRNode): node is TableNode;
export declare function makeNodeId(kind: 'route' | 'component' | 'table', repoRelativePath: string, symbol: string): NodeId;
export declare function makeEdgeId(kind: EdgeKind, from: NodeId, to: NodeId): EdgeId;
export {};
//# sourceMappingURL=ir.d.ts.map