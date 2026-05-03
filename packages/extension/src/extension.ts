import * as vscode from 'vscode'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { CodeSightPanel } from './webview.js'
import { runAnalysis } from './analyzer.js'
import type { IRGraph } from '@codebase-viz/types'
import type { DiagramSet } from '@codebase-viz/renderer'

interface DiagramCache {
  savedAt: number
  projectName: string
  routeCount: number
  tableCount: number
  diagrams: DiagramSet
}

function readCache(repoRoot: string): DiagramCache | undefined {
  try {
    const file = path.join(repoRoot, '.codesight', 'cache.json')
    if (!fs.existsSync(file)) return undefined
    return JSON.parse(fs.readFileSync(file, 'utf8')) as DiagramCache
  } catch {
    return undefined
  }
}

function writeCache(repoRoot: string, graph: IRGraph, diagrams: DiagramSet): void {
  try {
    const dir = path.join(repoRoot, '.codesight')
    fs.mkdirSync(dir, { recursive: true })
    const data: DiagramCache = {
      savedAt: Date.now(),
      projectName: graph.projectName ?? path.basename(repoRoot),
      routeCount: graph.nodes.filter(n => n.kind === 'route').length,
      tableCount: graph.nodes.filter(n => n.kind === 'table').length,
      diagrams,
    }
    fs.writeFileSync(path.join(dir, 'cache.json'), JSON.stringify(data))
  } catch {
    // non-fatal
  }
}

async function doAnalyze(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  forceRefresh = false,
): Promise<void> {
  const config = vscode.workspace.getConfiguration('codesight')
  const enableLLM = config.get<boolean>('enableLLM', false)
  const model = config.get<string>('model', 'claude-sonnet-4-6')

  let apiKey: string | undefined
  if (enableLLM) {
    apiKey = await context.secrets.get('codesight.anthropicKey')
    if (apiKey === undefined || apiKey === '') {
      const action = await vscode.window.showWarningMessage(
        'CodeSight: LLM analysis enabled but no API key found. Set one first.',
        'Set API Key',
      )
      if (action === 'Set API Key') {
        await vscode.commands.executeCommand('codesight.setApiKey')
      }
      return
    }
  }

  const panel = CodeSightPanel.createOrShow(context.extensionUri)
  panel.setReanalyzeCallback(() => void doAnalyze(context, workspaceRoot, true))

  if (!forceRefresh) {
    const cached = readCache(workspaceRoot)
    if (cached !== undefined) {
      panel.showCached(cached)
      return
    }
  }

  try {
    panel.showLoading()
    const { graph, diagrams } = await runAnalysis(
      workspaceRoot,
      apiKey !== undefined ? { apiKey, model } : undefined,
    )
    writeCache(workspaceRoot, graph, diagrams)
    panel.updateGraph(graph, diagrams)

    if (!enableLLM) {
      void vscode.window.showInformationMessage(
        'CodeSight: Static analysis complete. Enable LLM analysis for richer results (routing modes, components, backend services).',
        'Set API Key',
      ).then(action => {
        if (action === 'Set API Key') {
          void vscode.commands.executeCommand('codesight.setApiKey')
        }
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    void vscode.window.showErrorMessage(`CodeSight: Analysis failed — ${message}`)
    panel.showError(message)
  }
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('codesight.analyze', async () => {
      const workspaceRoot = getWorkspaceRoot()
      if (workspaceRoot === undefined) {
        void vscode.window.showErrorMessage('CodeSight: No workspace folder open.')
        return
      }
      await doAnalyze(context, workspaceRoot)
    }),

    vscode.commands.registerCommand('codesight.setApiKey', async () => {
      const key = await vscode.window.showInputBox({
        prompt: 'Enter your Anthropic API key',
        password: true,
        placeHolder: 'sk-ant-api03-...',
      })
      if (key !== undefined && key !== '') {
        await context.secrets.store('codesight.anthropicKey', key)
        void vscode.window.showInformationMessage('CodeSight: API key saved securely.')
      }
    }),

    vscode.commands.registerCommand('codesight.clearApiKey', async () => {
      await context.secrets.delete('codesight.anthropicKey')
      void vscode.window.showInformationMessage('CodeSight: API key cleared.')
    }),
  )
}

export function deactivate(): void {
  CodeSightPanel.dispose()
}

function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders
  if (folders === undefined || folders.length === 0) return undefined
  return folders[0]?.uri.fsPath
}
