// Task 1 PoC — Cytoscape webview (mermaid viewer와 sibling, 회귀 0).
// G1 통과 시 Task 2에서 정식화 (CodeSightPanel과 통합 또는 default 전환).
import * as vscode from 'vscode'
import * as path from 'node:path'
import * as fs from 'node:fs'
import type { IRGraph } from '@codebase-viz/types'
import {
  buildTab1CytoscapeOptions,
  buildTab2CytoscapeOptions,
  buildTab3CytoscapeOptions,
  type CytoscapeOptions,
} from '@codebase-viz/renderer'

interface CyDiagrams {
  tab1: CytoscapeOptions
  tab2: CytoscapeOptions
  tab3: CytoscapeOptions
  meta: { projectName: string }
}

function buildCyDiagrams(graph: IRGraph): CyDiagrams {
  return {
    tab1: buildTab1CytoscapeOptions(graph),
    tab2: buildTab2CytoscapeOptions(graph),
    tab3: buildTab3CytoscapeOptions(graph),
    meta: { projectName: graph.projectName ?? path.basename(graph.repoRoot) },
  }
}

export class CytoscapePocPanel {
  private static instance: CytoscapePocPanel | undefined
  private readonly panel: vscode.WebviewPanel
  private disposables: vscode.Disposable[] = []

  private constructor(
    private readonly extensionUri: vscode.Uri,
    panel: vscode.WebviewPanel,
  ) {
    this.panel = panel
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables)
  }

  static createOrShow(extensionUri: vscode.Uri): CytoscapePocPanel {
    if (CytoscapePocPanel.instance !== undefined) {
      CytoscapePocPanel.instance.panel.reveal(vscode.ViewColumn.Beside)
      return CytoscapePocPanel.instance
    }
    const panel = vscode.window.createWebviewPanel(
      'codesight-cytoscape-poc',
      'CodeSight — Cytoscape PoC',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      },
    )
    CytoscapePocPanel.instance = new CytoscapePocPanel(extensionUri, panel)
    return CytoscapePocPanel.instance
  }

  showGraph(graph: IRGraph): void {
    this.panel.webview.html = this.buildHtml(graph)
  }

  private buildHtml(graph: IRGraph): string {
    const webview = this.panel.webview
    const cspSource = webview.cspSource

    const cyJs = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'cy', 'cytoscape.min.js'))
    const elkJs = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'cy', 'elk.bundled.js'))
    const elkAdapter = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'cy', 'cytoscape-elk.js'))
    const expandCollapse = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'cy', 'cytoscape-expand-collapse.js'))

    const viewerPath = path.join(this.extensionUri.fsPath, 'media', 'viewer-cytoscape.html')
    let template: string
    try {
      template = fs.readFileSync(viewerPath, 'utf8')
    } catch {
      return `<html><body><pre>viewer-cytoscape.html not found</pre></body></html>`
    }

    const data = buildCyDiagrams(graph)

    const injection = [
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' ${cspSource}; style-src 'unsafe-inline'; img-src ${cspSource} data: blob:;">`,
      `<script>window.__CODESIGHT_CY__ = ${JSON.stringify(data)};</script>`,
    ].join('\n')

    return template
      .replace('<head>', `<head>\n${injection}`)
      .replace('cy/cytoscape.min.js', cyJs.toString())
      .replace('cy/elk.bundled.js', elkJs.toString())
      .replace('cy/cytoscape-elk.js', elkAdapter.toString())
      .replace('cy/cytoscape-expand-collapse.js', expandCollapse.toString())
  }

  static dispose(): void {
    CytoscapePocPanel.instance?.dispose()
  }

  private dispose(): void {
    CytoscapePocPanel.instance = undefined
    this.panel.dispose()
    for (const d of this.disposables) d.dispose()
    this.disposables = []
  }
}
