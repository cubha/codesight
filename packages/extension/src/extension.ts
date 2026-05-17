import * as vscode from 'vscode'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { CodeSightPanel } from './webview.js'
import { SidebarProvider, type StatusInfo } from './sidebarProvider.js'
import { PanelProvider } from './panelProvider.js'
import { runAnalysis } from './analyzer.js'
import { resolveSelectedFolder } from './folder-utils.js'
import { detectStack } from '@codebase-viz/llm'
import type { IRGraph } from '@codebase-viz/types'
import { t, resolveLocale } from './i18n/dict.js'

function getLocale() {
  const setting = vscode.workspace.getConfiguration('codesight').get<string>('language', 'auto')
  return resolveLocale(setting, vscode.env.language)
}

type LLMProvider = 'anthropic' | 'google' | 'openai'

function getProvider(): LLMProvider {
  const val = vscode.workspace.getConfiguration('codesight').get<string>('llm.provider', 'anthropic')
  if (val === 'google' || val === 'openai') return val
  return 'anthropic'
}

function apiKeySlot(provider: LLMProvider): string {
  return `codesight.llm.apiKey.${provider}`
}

async function migrateApiKey(context: vscode.ExtensionContext): Promise<void> {
  const MIGRATED_FLAG = 'codesight.llm.keyMigrated'
  if (context.globalState.get<boolean>(MIGRATED_FLAG)) return
  const legacy = await context.secrets.get('codesight.anthropicKey')
  if (legacy !== undefined && legacy !== '') {
    await context.secrets.store(apiKeySlot('anthropic'), legacy)
    await context.secrets.delete('codesight.anthropicKey')
  }
  await context.globalState.update(MIGRATED_FLAG, true)
}
import { setWasmDir } from '@codebase-viz/core'
import type { DiagramSet } from '@codebase-viz/renderer'

async function getStackStatus(workspaceRoot: string): Promise<Pick<StatusInfo, 'framework' | 'parsingLevel' | 'llmRecommended'>> {
  try {
    const stack = await detectStack(workspaceRoot)
    return {
      framework: stack.framework,
      parsingLevel: stack.parsingLevel,
      llmRecommended: stack.llmRecommended,
    }
  } catch {
    return {}
  }
}

interface DiagramCache {
  savedAt: number
  projectName: string
  routeCount: number
  tableCount: number
  diagrams: DiagramSet
}

let sidebarProvider: SidebarProvider | undefined
let panelProvider: PanelProvider | undefined

const STATE_KEY_SELECTED_FOLDER = 'codesight.selectedFolder'

function listWorkspaceFolders(): readonly vscode.WorkspaceFolder[] {
  return vscode.workspace.workspaceFolders ?? []
}

function getWorkspaceRoot(context?: vscode.ExtensionContext): string | undefined {
  const folders = listWorkspaceFolders()
  const saved = context?.workspaceState.get<string>(STATE_KEY_SELECTED_FOLDER)
  return resolveSelectedFolder(folders, saved)
}

async function pickWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = listWorkspaceFolders()
  if (folders.length === 0) return undefined
  if (folders.length === 1) return folders[0]
  const items = folders.map(f => ({ label: f.name, description: f.uri.fsPath, folder: f }))
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: t('pick.selectWorkspace', getLocale()),
  })
  return picked?.folder
}

function buildFolderList(): { name: string; fsPath: string }[] {
  return listWorkspaceFolders().map(f => ({ name: f.name, fsPath: f.uri.fsPath }))
}

async function pickPairFolder(mainFsPath: string): Promise<string | undefined> {
  const others = listWorkspaceFolders().filter(f => f.uri.fsPath !== mainFsPath)
  if (others.length === 0) return undefined

  const SKIP_LABEL = '$(close) Skip — single project only'
  const items: { label: string; description?: string; fsPath?: string }[] = [
    { label: SKIP_LABEL },
    ...await Promise.all(others.map(async f => {
      let description = f.uri.fsPath
      try {
        const stack = await detectStack(f.uri.fsPath)
        description = `${stack.framework} · ${f.uri.fsPath}`
      } catch { /* ignore */ }
      return { label: f.name, description, fsPath: f.uri.fsPath }
    })),
  ]

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: t('pick.selectPair', getLocale()),
  })
  if (picked === undefined || picked.label === SKIP_LABEL) return undefined
  return picked.fsPath
}

function cacheFileName(pairRepoRoot?: string): string {
  if (pairRepoRoot === undefined) return 'cache.json'
  const suffix = path.basename(pairRepoRoot).replace(/[^a-z0-9]/gi, '_').toLowerCase()
  return `cache-pair-${suffix}.json`
}

function readCache(repoRoot: string, pairRepoRoot?: string): DiagramCache | undefined {
  try {
    const file = path.join(repoRoot, '.codesight', cacheFileName(pairRepoRoot))
    if (!fs.existsSync(file)) return undefined
    return JSON.parse(fs.readFileSync(file, 'utf8')) as DiagramCache
  } catch {
    return undefined
  }
}

function writeCache(repoRoot: string, graph: IRGraph, diagrams: DiagramSet, pairRepoRoot?: string): void {
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
    fs.writeFileSync(path.join(dir, cacheFileName(pairRepoRoot)), JSON.stringify(data))
  } catch {
    // non-fatal
  }
}

async function doAnalyze(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  forceRefresh = false,
  pairRepoRoot?: string,
): Promise<void> {
  const config = vscode.workspace.getConfiguration('codesight')
  const enableLLM = config.get<boolean>('enableLLM', false)
  const model = config.get<string>('model', 'claude-sonnet-4-6')
  const provider = getProvider()

  let apiKey: string | undefined
  if (enableLLM) {
    apiKey = await context.secrets.get(apiKeySlot(provider))
    if (apiKey === undefined || apiKey === '') {
      const setKeyLabel = t('msg.btnSetApiKey', getLocale())
      const action = await vscode.window.showWarningMessage(
        t('msg.llmNoApiKey', getLocale()),
        setKeyLabel,
      )
      if (action === setKeyLabel) {
        await vscode.commands.executeCommand('codesight.setApiKey')
      }
      return
    }
  }

  const panel = CodeSightPanel.createOrShow(context.extensionUri)

  const stackStatus = await getStackStatus(workspaceRoot)

  if (!forceRefresh) {
    const cached = readCache(workspaceRoot, pairRepoRoot)
    if (cached !== undefined) {
      panel.showCached(cached)
      sidebarProvider?.updateStatus({
        projectName: cached.projectName,
        cachedAt: cached.savedAt,
        routeCount: cached.routeCount,
        tableCount: cached.tableCount,
        analyzing: false,
        hasCache: true,
        ...stackStatus,
      })
      panelProvider?.setResult(cached)
      return
    }
  }

  try {
    sidebarProvider?.updateStatus({ analyzing: true, hasCache: false, ...stackStatus })
    panelProvider?.setAnalyzing(true, path.basename(workspaceRoot))
    panel.showLoading()

    const groupingCfg = vscode.workspace.getConfiguration('codesight.grouping')
    const grouping = {
      maxNodesPerGroup: groupingCfg.get<number>('maxNodesPerGroup', 30),
      maxDepth: groupingCfg.get<number>('maxDepth', 8),
    }
    const { graph, diagrams } = await runAnalysis(workspaceRoot, {
      ...(apiKey !== undefined ? { llm: { apiKey, model, provider } } : {}),
      grouping,
      ...(pairRepoRoot !== undefined ? { pairRepoRoot } : {}),
    })
    writeCache(workspaceRoot, graph, diagrams, pairRepoRoot)
    panel.updateGraph(graph, diagrams)

    const result = {
      projectName: graph.projectName ?? path.basename(workspaceRoot),
      routeCount: graph.nodes.filter(n => n.kind === 'route').length,
      tableCount: graph.nodes.filter(n => n.kind === 'table').length,
      cachedAt: Date.now(),
    }
    sidebarProvider?.updateStatus({ ...result, analyzing: false, hasCache: true, ...stackStatus })
    panelProvider?.setAnalyzing(false)
    panelProvider?.setResult(result)

    if (!enableLLM) {
      const setKeyLabel = t('msg.btnSetApiKey', getLocale())
      void vscode.window.showInformationMessage(
        t('msg.staticComplete', getLocale()),
        setKeyLabel,
      ).then(action => {
        if (action === setKeyLabel) {
          void vscode.commands.executeCommand('codesight.setApiKey')
        }
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    sidebarProvider?.updateStatus({ analyzing: false })
    panelProvider?.setAnalyzing(false)
    panelProvider?.log(t('panel.error', getLocale(), { message }))
    void vscode.window.showErrorMessage(t('msg.analysisFailed', getLocale(), { message }))
    panel.showError(message)
  }
}

export function activate(context: vscode.ExtensionContext): void {
  setWasmDir(path.join(context.extensionPath, 'dist', 'wasm'))
  void migrateApiKey(context)
  sidebarProvider = new SidebarProvider(context.extensionUri)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider),
  )

  panelProvider = new PanelProvider(context.extensionUri)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(PanelProvider.viewType, panelProvider),
  )

  // Push initial status
  void (async () => {
    const hasApiKey = (await context.secrets.get(apiKeySlot(getProvider())) ?? '') !== ''
    const llmEnabled = vscode.workspace.getConfiguration('codesight').get<boolean>('enableLLM', false)
    const workspaceRoot = getWorkspaceRoot(context)
    const cached = workspaceRoot !== undefined ? readCache(workspaceRoot) : undefined
    const stackStatus = workspaceRoot !== undefined ? await getStackStatus(workspaceRoot) : {}

    sidebarProvider?.updateStatus({
      hasApiKey,
      llmEnabled,
      provider: getProvider(),
      hasCache: cached !== undefined,
      projectName: cached?.projectName,
      cachedAt: cached?.savedAt,
      routeCount: cached?.routeCount,
      tableCount: cached?.tableCount,
      folders: buildFolderList(),
      selectedFolder: workspaceRoot,
      ...stackStatus,
    })
  })()

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      const root = getWorkspaceRoot(context)
      sidebarProvider?.updateStatus({
        folders: buildFolderList(),
        selectedFolder: root,
      })
    }),
  )

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('codesight.enableLLM')) {
        const llmEnabled = vscode.workspace.getConfiguration('codesight').get<boolean>('enableLLM', false)
        sidebarProvider?.updateStatus({ llmEnabled })
      }
      if (e.affectsConfiguration('codesight.llm.provider')) {
        const provider = getProvider()
        void context.secrets.get(apiKeySlot(provider)).then(key => {
          sidebarProvider?.updateStatus({ provider, hasApiKey: (key ?? '') !== '' })
        })
      }
      // language 변경 시 모든 webview를 새 locale로 즉시 다시 렌더 (reload 불필요).
      if (e.affectsConfiguration('codesight.language')) {
        sidebarProvider?.refreshLocale()
        CodeSightPanel.getInstance()?.refreshLocale()
      }
    }),
  )

  context.subscriptions.push(
    // 캐시 없을 때: 분석 실행 (multi-root 시 2단계 QuickPick)
    vscode.commands.registerCommand('codesight.analyze', async () => {
      const workspaceRoot = getWorkspaceRoot(context)
      if (workspaceRoot === undefined) {
        void vscode.window.showErrorMessage(t('msg.noWorkspace', getLocale()))
        return
      }
      const pairRepoRoot = await pickPairFolder(workspaceRoot)
      await doAnalyze(context, workspaceRoot, false, pairRepoRoot)
    }),

    // 캐시 있을 때: 강제 재분석 (multi-root 시 2단계 QuickPick)
    vscode.commands.registerCommand('codesight.reanalyze', async () => {
      const workspaceRoot = getWorkspaceRoot(context)
      if (workspaceRoot === undefined) {
        void vscode.window.showErrorMessage(t('msg.noWorkspace', getLocale()))
        return
      }
      const pairRepoRoot = await pickPairFolder(workspaceRoot)
      await doAnalyze(context, workspaceRoot, true, pairRepoRoot)
    }),

    // 캐시 있을 때: 웹뷰만 열기 (재분석 없음)
    vscode.commands.registerCommand('codesight.openViewer', async () => {
      const workspaceRoot = getWorkspaceRoot(context)
      if (workspaceRoot === undefined) return
      const cached = readCache(workspaceRoot)
      if (cached === undefined) {
        void vscode.window.showInformationMessage(t('msg.noCacheRunFirst', getLocale()))
        return
      }
      const panel = CodeSightPanel.createOrShow(context.extensionUri)
      panel.showCached(cached)
    }),

    // 멀티 워크스페이스: 폴더 선택
    vscode.commands.registerCommand('codesight.selectFolder', async (fsPath?: unknown) => {
      let target: vscode.WorkspaceFolder | undefined
      if (typeof fsPath === 'string') {
        target = listWorkspaceFolders().find(f => f.uri.fsPath === fsPath)
      }
      if (target === undefined) {
        target = await pickWorkspaceFolder()
      }
      if (target === undefined) return
      await context.workspaceState.update(STATE_KEY_SELECTED_FOLDER, target.uri.fsPath)
      const cached = readCache(target.uri.fsPath)
      const stackStatus = await getStackStatus(target.uri.fsPath)
      sidebarProvider?.updateStatus({
        selectedFolder: target.uri.fsPath,
        folders: buildFolderList(),
        hasCache: cached !== undefined,
        projectName: cached?.projectName,
        cachedAt: cached?.savedAt,
        routeCount: cached?.routeCount,
        tableCount: cached?.tableCount,
        ...stackStatus,
      })
    }),

    // 사이드바 Export 버튼 → 웹뷰에 triggerExport 전달
    vscode.commands.registerCommand('codesight.exportFromSidebar', (format: unknown) => {
      const fmt = format as 'png' | 'svg' | 'md'
      const panel = CodeSightPanel.getInstance()
      if (panel === undefined) {
        // 웹뷰가 열려있지 않으면 먼저 열고 export
        void vscode.commands.executeCommand('codesight.openViewer').then(() => {
          setTimeout(() => CodeSightPanel.getInstance()?.triggerExport(fmt), 800)
        })
        return
      }
      panel.triggerExport(fmt)
    }),

    vscode.commands.registerCommand('codesight.setApiKey', async () => {
      const provider = getProvider()
      const locale = getLocale()
      const providerLabel = provider === 'google' ? 'Google Gemini' : provider === 'openai' ? 'OpenAI' : 'Anthropic'
      const placeholderMap: Record<LLMProvider, string> = {
        anthropic: 'sk-ant-api03-...',
        google: 'AIza...',
        openai: 'sk-...',
      }
      const key = await vscode.window.showInputBox({
        prompt: t('msg.setApiKeyPrompt', locale, { provider: providerLabel }),
        password: true,
        placeHolder: placeholderMap[provider],
      })
      if (key !== undefined && key !== '') {
        await context.secrets.store(apiKeySlot(getProvider()), key)
        sidebarProvider?.updateStatus({ hasApiKey: true })
        void vscode.window.showInformationMessage(t('msg.apiKeySaved', getLocale()))
      }
    }),

    vscode.commands.registerCommand('codesight.clearApiKey', async () => {
      await context.secrets.delete(apiKeySlot(getProvider()))
      sidebarProvider?.updateStatus({ hasApiKey: false })
      void vscode.window.showInformationMessage(t('msg.apiKeyCleared', getLocale()))
    }),
  )
}

export function deactivate(): void {
  CodeSightPanel.dispose()
}
