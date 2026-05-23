# Data Flow (Screen ↔ Data Source)

```mermaid
%%{init:{'theme':'base','themeVariables':{'background':'#060810','primaryColor':'#2a4055','primaryTextColor':'#f8fafc','primaryBorderColor':'#1e4060','lineColor':'#f59e0b','secondaryColor':'#0f172a','tertiaryColor':'#1a0a20','attributeBackgroundColorEven':'#ffffff','attributeBackgroundColorOdd':'#f1f5f9','textColor':'#1e293b','nodeBorder':'#1e4060','clusterBkg':'#0a0e1a','fontFamily':'JetBrains Mono','fontSize':'14'}}}%%
erDiagram
%% table:posts path:types/supabase.ts
%% table:profiles path:types/supabase.ts
  posts {
    text id PK
    text title
    text content
    text author_id FK
    text created_at
  }
  profiles {
    text id PK
    text username
    text avatar_url
  }
  PostList {
    string name
  }
  posts }o--|| profiles : "author_id"
  PostList }|--|| posts : "queries"
```
