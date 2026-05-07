import * as vscode from 'vscode'

export interface StatusInfo {
  projectName?: string
  cachedAt?: number
  routeCount?: number
  tableCount?: number
  analyzing?: boolean
  hasApiKey?: boolean
  llmEnabled?: boolean
  hasCache?: boolean
  framework?: string
  parsingLevel?: 'L1' | 'L2' | 'L3'
  llmRecommended?: boolean
  folders?: { name: string; fsPath: string }[]
  selectedFolder?: string
}

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'codesight.sidebar'
  private _view?: vscode.WebviewView
  private _status: StatusInfo = {}

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView
    webviewView.webview.options = { enableScripts: true }
    webviewView.webview.html = this._getHtml()

    webviewView.webview.onDidReceiveMessage(async (msg: { type: string; value?: unknown }) => {
      switch (msg.type) {
        case 'ready':
          // webview가 완전히 로드된 후 status 전달
          this._pushStatus()
          break
        case 'analyze':
          await vscode.commands.executeCommand('codesight.analyze')
          break
        case 'reanalyze':
          await vscode.commands.executeCommand('codesight.reanalyze')
          break
        case 'openViewer':
          await vscode.commands.executeCommand('codesight.openViewer')
          break
        case 'exportRequest':
          await vscode.commands.executeCommand('codesight.exportFromSidebar', msg.value)
          break
        case 'setApiKey':
          await vscode.commands.executeCommand('codesight.setApiKey')
          break
        case 'clearApiKey':
          await vscode.commands.executeCommand('codesight.clearApiKey')
          break
        case 'toggleLLM':
          await vscode.workspace
            .getConfiguration('codesight')
            .update('enableLLM', msg.value, vscode.ConfigurationTarget.Global)
          break
        case 'selectFolder':
          await vscode.commands.executeCommand('codesight.selectFolder', msg.value)
          break
      }
    })
    // status 전달은 webview의 'ready' 신호 수신 시 처리
  }

  public updateStatus(info: StatusInfo): void {
    this._status = { ...this._status, ...info }
    this._pushStatus()
  }

  private _pushStatus(): void {
    this._view?.webview.postMessage({ type: 'status', ...this._status })
  }

  private _getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background);
    padding: 10px;
  }
  .section { margin-bottom: 14px; }
  .label {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--vscode-descriptionForeground);
    margin-bottom: 6px;
  }
  .status-box {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px; padding: 8px 10px; font-size: 11px; line-height: 1.6;
  }
  .project-name { font-weight: 600; }
  .meta { color: var(--vscode-descriptionForeground); font-size: 10px; }
  .analyzing { color: var(--vscode-charts-blue); }
  .no-cache { color: var(--vscode-descriptionForeground); font-style: italic; }
  .stack-row {
    display: flex; align-items: center; gap: 6px;
    margin-top: 8px; padding: 6px 10px;
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px; font-size: 10.5px;
  }
  .stack-label { color: var(--vscode-descriptionForeground); }
  .stack-value { color: var(--vscode-foreground); font-weight: 600; }
  .level-badge {
    padding: 1px 6px; border-radius: 3px; font-size: 9.5px;
    background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
  }
  .llm-warning {
    margin-top: 5px; padding: 5px 8px; border-radius: 3px;
    font-size: 10.5px; background: rgba(251,146,60,0.12);
    color: var(--vscode-charts-orange, #fb923c);
    border-left: 2px solid var(--vscode-charts-orange, #fb923c);
  }
  button {
    width: 100%; padding: 5px 10px; margin-bottom: 5px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none; border-radius: 3px; cursor: pointer;
    font-size: 12px; text-align: left;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button:disabled { opacity: 0.4; cursor: default; pointer-events: none; }
  .export-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; }
  .export-grid button { text-align: center; font-size: 11px; padding: 5px 4px; }
  .api-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-size: 11px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .dot.on  { background: #4ade80; }
  .dot.off { background: var(--vscode-descriptionForeground); }
  .toggle-row {
    display: flex; align-items: center; justify-content: space-between;
    font-size: 11px; margin-top: 6px;
  }
  .toggle {
    width: 28px; height: 14px; background: var(--vscode-descriptionForeground);
    border-radius: 7px; position: relative; cursor: pointer; transition: background .2s; flex-shrink: 0;
  }
  .toggle.on { background: var(--vscode-charts-blue); }
  .toggle::after {
    content: ''; position: absolute; width: 10px; height: 10px;
    background: white; border-radius: 50%; top: 2px; left: 2px; transition: left .2s;
  }
  .toggle.on::after { left: 16px; }
  hr { border: none; border-top: 1px solid var(--vscode-panel-border); margin: 10px 0; }
</style>
</head>
<body>

<div class="section" id="folderSection" style="display:none">
  <div class="label">Workspace Folder</div>
  <select id="folderSelect" onchange="selectFolder(this.value)"
    style="width:100%;padding:4px 6px;background:var(--vscode-dropdown-background);
    color:var(--vscode-dropdown-foreground);border:1px solid var(--vscode-dropdown-border);
    border-radius:3px;font-size:11px;"></select>
</div>

<div class="section">
  <div class="label">Status</div>
  <div class="status-box">
    <div id="projName" class="project-name no-cache">분석 결과 없음</div>
    <div id="metaLine" class="meta"></div>
  </div>
  <div id="stackRow" class="stack-row" style="display:none">
    <span class="stack-label">Stack:</span>
    <span id="stackValue" class="stack-value">—</span>
    <span id="levelBadge" class="level-badge">L?</span>
  </div>
  <div id="llmWarning" class="llm-warning" style="display:none">
    ⚠ LLM strongly recommended for this stack
  </div>
</div>

<div class="section">
  <div class="label">Actions</div>
  <button id="btnAnalyze" onclick="send('analyze')">▶ Analyze Project</button>
  <button id="btnReanalyze" class="secondary" style="display:none" onclick="send('reanalyze')">↺ Re-analyze</button>
  <button id="btnViewer" class="secondary" disabled onclick="send('openViewer')">⊞ Open Viewer</button>
</div>

<div class="section" id="exportSection" style="display:none">
  <div class="label">Export</div>
  <div class="export-grid">
    <button class="secondary" onclick="send('exportRequest','png')">🖼 PNG</button>
    <button class="secondary" onclick="send('exportRequest','svg')">✦ SVG</button>
    <button class="secondary" onclick="send('exportRequest','md')">↓ MD</button>
  </div>
</div>

<hr>

<div class="section">
  <div class="label">LLM Analysis</div>
  <div class="api-row">
    <div class="dot off" id="apiDot"></div>
    <span id="apiLabel">API Key: Not set</span>
  </div>
  <button class="secondary" onclick="send('setApiKey')">🔑 Set API Key</button>
  <button class="secondary" onclick="send('clearApiKey')">✕ Clear API Key</button>
  <div class="toggle-row">
    <span>Enable LLM Analysis</span>
    <div class="toggle" id="llmToggle" onclick="toggleLLM()"></div>
  </div>
</div>

<script>
  const vscode = acquireVsCodeApi();
  let llmOn = false;

  function send(type, value) { vscode.postMessage({ type, value }); }

  // webview 로드 완료 시 extension에 알림 → extension이 현재 status 전달
  window.addEventListener('load', () => send('ready'));

  function selectFolder(fsPath) { send('selectFolder', fsPath); }

  function toggleLLM() {
    llmOn = !llmOn;
    document.getElementById('llmToggle').className = 'toggle' + (llmOn ? ' on' : '');
    send('toggleLLM', llmOn);
  }

  window.addEventListener('message', e => {
    const s = e.data;
    if (s.type !== 'status') return;

    // Folder dropdown (multi-workspace)
    if (Array.isArray(s.folders) && s.folders.length > 0) {
      const select = document.getElementById('folderSelect');
      const section = document.getElementById('folderSection');
      // Only rebuild if folder list changed
      const sig = s.folders.map(f => f.fsPath).join('|');
      if (select.dataset.sig !== sig) {
        select.innerHTML = '';
        for (const f of s.folders) {
          const opt = document.createElement('option');
          opt.value = f.fsPath;
          opt.textContent = f.name;
          opt.title = f.fsPath;
          select.appendChild(opt);
        }
        select.dataset.sig = sig;
      }
      if (s.selectedFolder) select.value = s.selectedFolder;
      section.style.display = s.folders.length > 1 ? 'block' : 'none';
    }

    const hasCache = !!s.hasCache;

    // Status box
    if (s.analyzing) {
      document.getElementById('projName').textContent = 'Analyzing...';
      document.getElementById('projName').className = 'project-name analyzing';
      document.getElementById('metaLine').textContent = '';
    } else if (hasCache && s.projectName) {
      document.getElementById('projName').textContent = s.projectName;
      document.getElementById('projName').className = 'project-name';
      const parts = [];
      if (s.routeCount != null) parts.push(s.routeCount + ' routes');
      if (s.tableCount != null) parts.push(s.tableCount + ' tables');
      if (s.cachedAt) parts.push('cached ' + fmtAgo(s.cachedAt));
      document.getElementById('metaLine').textContent = parts.join(' · ');
    } else {
      document.getElementById('projName').textContent = '분석 결과 없음';
      document.getElementById('projName').className = 'project-name no-cache';
      document.getElementById('metaLine').textContent = '';
    }

    // Buttons
    document.getElementById('btnAnalyze').style.display   = hasCache ? 'none'  : 'block';
    document.getElementById('btnReanalyze').style.display = hasCache ? 'block' : 'none';
    document.getElementById('btnViewer').disabled = !hasCache;
    document.getElementById('exportSection').style.display = hasCache ? 'block' : 'none';

    // Analyzing state: disable all action buttons
    if (s.analyzing) {
      document.getElementById('btnAnalyze').disabled = true;
      document.getElementById('btnReanalyze').disabled = true;
      document.getElementById('btnViewer').disabled = true;
    } else {
      document.getElementById('btnAnalyze').disabled = false;
      document.getElementById('btnReanalyze').disabled = false;
    }

    // Stack badge
    const FRAMEWORK_NAMES = {
      'nextjs-app-router': 'Next.js (App Router)',
      'nextjs-pages':      'Next.js (Pages)',
      'nuxt':              'Nuxt',
      'sveltekit':         'SvelteKit',
      'expo':              'Expo',
      'vite-react':        'Vite + React',
      'nestjs':            'NestJS',
      'unknown':           'Unknown',
    };
    if (s.framework) {
      const display = FRAMEWORK_NAMES[s.framework] || s.framework;
      document.getElementById('stackValue').textContent = display;
      document.getElementById('levelBadge').textContent = s.parsingLevel || 'L?';
      document.getElementById('stackRow').style.display = 'flex';
    }
    document.getElementById('llmWarning').style.display = s.llmRecommended ? 'block' : 'none';

    // API Key
    if (s.hasApiKey != null) {
      document.getElementById('apiDot').className = 'dot ' + (s.hasApiKey ? 'on' : 'off');
      document.getElementById('apiLabel').textContent = s.hasApiKey ? 'API Key: Set ✓' : 'API Key: Not set';
    }

    // LLM toggle
    if (s.llmEnabled != null) {
      llmOn = s.llmEnabled;
      document.getElementById('llmToggle').className = 'toggle' + (llmOn ? ' on' : '');
    }
  });

  function fmtAgo(ts) {
    const d = Math.floor((Date.now() - ts) / 1000);
    if (d < 60) return d + 's ago';
    if (d < 3600) return Math.floor(d/60) + 'm ago';
    return Math.floor(d/3600) + 'h ago';
  }
</script>
</body>
</html>`
  }
}
