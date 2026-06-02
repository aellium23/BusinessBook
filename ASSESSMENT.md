# BusinessBook CRM — Full Project Assessment

**Date:** 2026-06-02
**Auditor:** Claude Code (3 specialist agents)
**Scope:** Complete diagnostic — no code changes

---

## DASHBOARD EXECUTIVO

| Domínio | Score | Veredito |
|---------|-------|----------|
| A. Arquitetura & Código | 5/10 | Monolítico, ficheiros grandes, duplicação |
| B. Lógica de Negócio | 5/10 | Cálculos correctos mas sem validação de transições |
| C. Segurança | 4/10 | **RLS insuficiente para distribuidores — dados sensíveis expostos** |
| D. Base de Dados | 6/10 | Schema robusto, 22 tabelas, mas migrações dispersas |
| E. Frontend / UX | 7/10 | Design system coerente, bom mobile, mas erros silenciosos |
| F. PWA | 1/10 | **Nada implementado — sem manifest, sem service worker** |
| G. Responsiveness | 8/10 | Excelente suporte mobile, touch targets 44px, safe areas |
| H. i18n | 5/10 | 3 línguas parciais, ~762 strings hardcoded, PT falta 64 keys |
| I. Qualidade & Manutenção | 3/10 | Zero testes, zero logging estruturado |
| J. Performance | 5/10 | Bundle 1.5MB sem code-splitting, 11 queries no Dashboard |
| K. Stack | 7/10 | Adequada com limitações (ver abaixo) |

### **Veredito Geral: CONDICIONAL**
A app funciona mas NÃO está production-ready como produto final. Precisa de correcções de segurança críticas, PWA completa, e estabilização antes de poder ser considerada um produto instalável e escalável.

---

## TOP 10 PROBLEMAS CRÍTICOS

| # | Problema | Severidade | Impacto | Esforço | Ficheiro |
|---|---------|-----------|---------|---------|----------|
| 1 | **cost_price/margin_pct legíveis por distribuidores via API** | CRÍTICO | Dados comerciais sensíveis expostos | Médio | security_v2.sql, deal_products RLS |
| 2 | **Deals RLS não filtra por company_id** — distribuidor vê TODOS os deals do BU | CRÍTICO | Data leak entre distribuidores | Médio | security.sql:24-27 |
| 3 | **PWA inexistente** — sem manifest, service worker, ícones | CRÍTICO | Não instalável como app standalone | Alto | index.html, novo manifest.json |
| 4 | **Bundle 1.5MB sem code-splitting** | ALTO | Carregamento lento, especialmente mobile | Médio | App.jsx (lazy imports) |
| 5 | **Zero testes automatizados** | ALTO | Regressões frequentes, correcções cíclicas | Alto | Todo o projecto |
| 6 | **Erros de Supabase silenciosos** — utilizador nunca vê falhas de rede | ALTO | UX degradada, dados aparentemente vazios | Médio | Todos os hooks e pages |
| 7 | **Sem validação de transições de estado** (deals e contratos) | MÉDIO | Dados inconsistentes, bypass de workflow | Médio | DealForm.jsx, SLAs.jsx |
| 8 | **i18n incompleto** — 762 strings hardcoded, PT falta 64 keys | MÉDIO | Experiência inconsistente em PT/ES | Alto | 28 ficheiros |
| 9 | **Ficheiros monolíticos** — DealForm 1440 linhas, Permissions 1337 | MÉDIO | Manutenção difícil, bugs frequentes | Alto | 5 ficheiros |
| 10 | **28 console.warn/error em produção** + dead code | BAIXO | Ruído, bundle desnecessário | Baixo | Vários |

---

## FASE 1 — MAPEAMENTO

### Stack Tecnológica
| Componente | Tecnologia | Versão |
|-----------|-----------|--------|
| Frontend | React | 18.2 |
| Build | Vite | 5.4 |
| CSS | Tailwind CSS | 3.4 |
| Backend | Supabase (PostgreSQL + Auth + RLS) | supabase-js 2.39 |
| Charting | Recharts | 2.10 |
| Icons | Lucide React | 0.309 |
| Routing | React Router DOM | 6.21 |
| Deploy | Vercel | Auto-deploy |

### Dimensões do Projecto
- **55 ficheiros fonte** (.jsx + .js)
- **20,977 linhas de código**
- **22 tabelas Supabase**
- **11 dependências** (6 prod + 5 dev) — stack lean
- **2 vulnerabilidades** (dev-only, esbuild/vite)
- **Bundle**: 1,517 KB JS + 50 KB CSS

### Top 10 Ficheiros por Tamanho
| Ficheiro | Linhas |
|---------|--------|
| HelpGuide.jsx | 1,649 |
| DealForm.jsx | 1,439 |
| i18n.js | 1,403 |
| Permissions.jsx | 1,337 |
| SLAs.jsx | 1,065 |
| Deals.jsx | 995 |
| Dashboard.jsx | 986 |
| DashboardSummary.jsx | 705 |
| Budget.jsx | 699 |
| Products.jsx | 618 |

### Dead Code Identificado
1. `src/hooks/Settings.jsx` — componente órfão, nunca importado
2. `src/pages/Users.jsx` — não importado em App.jsx, sem rota
3. `DealForm.jsx:317` — `isMaint = false` hardcoded, todo o bloco associado é dead code
4. 28 `console.warn/error` em produção

---

## FASE 2 — AUDITORIA POR DOMÍNIO

### A. Arquitetura & Código — 5/10

**Positivo:**
- Hooks seguem padrão consistente (useState + useCallback + useEffect)
- Design system coerente em ui.jsx + index.css
- Separação páginas/componentes/hooks/lib clara

**Problemas:**
- Ficheiros monolíticos: Permissions.jsx tem 5 componentes inline
- DealForm.jsx carrega 7 datasets num único useEffect
- MONTHS_K duplicado em DealForm.jsx (já existe em constants.js)
- Sem cache layer — cada mount faz queries frescas
- Sem optimistic updates
- Zero `React.memo()` em componentes de lista

### B. Lógica de Negócio — 5/10

**Positivo:**
- Cálculos de revenue correctos com Number() coercion consistente
- Forecast categories com fallback stage-based
- FY fiscal year (Apr-Mar) correctamente implementado
- Contract lifecycle com 8 estados validados por DB constraint

**Problemas:**
- Transições de estado de deals não validadas — Pipeline → Invoiced sem passar por BackLog
- Transições de estado de contratos não enforced — qualquer status → qualquer outro
- Kanban drag permite saltos arbitrários de stage
- Sem state machine no frontend nem no backend

### C. Segurança — 4/10

**CRÍTICO:**
- `deal_products` RLS permite SELECT de cost_price/margin_pct a qualquer user do mesmo BU, incluindo distribuidores. UI esconde mas API expõe.
- `deals` RLS filtra por BU mas não por company_id — distribuidor A vê deals do distribuidor B no mesmo BU.

**Positivo:**
- Zero dangerouslySetInnerHTML ou eval()
- Supabase keys via env vars (não hardcoded)
- CSV export escapa formula injection
- .gitignore exclui .env
- Auth split com anonClient evita conflito de sessão

**Melhorias necessárias:**
- Validação de input mínima (só verifica campos vazios)
- Sem rate limiting no frontend
- 28 console statements em produção (information disclosure minor)

### D. Base de Dados — 6/10

**Positivo:**
- 22 tabelas com schema normalizado
- FK constraints, check constraints, indexes
- RLS em todas as tabelas
- Audit triggers via SECURITY DEFINER
- Migrações idempotentes (IF NOT EXISTS)

**Problemas:**
- 15+ ficheiros de migração dispersos sem numeração sequencial
- Sem migration runner — cada SQL é corrido manualmente
- Sem backups automatizados (depende do Supabase)
- N+1 subquery pattern em algumas RLS policies (sla_products, sla_usage)
- Sem stored procedures para operações complexas

### E. Frontend / UX — 7/10

**Positivo:**
- Design system coerente (card, btn, input, badge classes)
- Tailwind config com tokens customizados (navy, vgt, ect, tap sizes)
- Modal com bottom-sheet mobile, safe areas, drag handle
- Loading states consistentes (Spinner)
- Empty states com CTA

**Problemas:**
- Erros de Supabase silenciosos — utilizador nunca vê falhas de rede/dados
- Dashboard Classic mostra spinner custom em vez do componente partilhado
- Algumas inconsistências de design entre páginas antigas e novas

### F. PWA — 1/10

**NADA IMPLEMENTADO:**
- [ ] manifest.json
- [ ] Service worker
- [ ] `<meta name="theme-color">`
- [ ] `<link rel="manifest">`
- [ ] apple-touch-icon
- [ ] Ícones 192px + 512px + maskable
- [ ] start_url
- [ ] display: standalone
- [ ] Estratégia de cache
- [ ] Comportamento offline
- [ ] beforeinstallprompt handler

**Presente:**
- [x] HTTPS (via Vercel)
- [x] viewport meta com viewport-fit=cover

### G. Responsiveness — 8/10

**Excelente:**
- Touch targets 44px enforced via CSS e Tailwind
- iOS zoom prevention (font-size 16px !important)
- Bottom-sheet modals com safe-area insets
- Grids responsivos (grid-cols-2 sm:grid-cols-4)
- overflow-x-auto em tabelas largas

**Problemas menores:**
- Kanban (Deals e Contracts) força scroll horizontal com min-w-[900px]
- Budget P&L table densa no mobile (funcional mas apertada)

### H. i18n — 5/10

**Implementado:**
- Sistema custom zero-dep com 3 línguas (EN, ES, PT)
- 435 keys EN, 435 keys ES, 371 keys PT
- Hook useTranslation() funcional
- HelpGuide com conteúdo trilingual

**Problemas:**
- PT falta ~64 keys (fallback silencioso para EN)
- ~762 strings hardcoded em inglês em 28 ficheiros
- formatK() hardcodes símbolo € independente da moeda
- Formatação de datas inconsistente (pt-PT em alguns, none em outros)
- Sem Intl.NumberFormat wrapper

### I. Qualidade & Manutenção — 3/10

- **Zero testes** (unit, integration, e2e) — regressões são descobertas pelo utilizador
- **Zero logging estruturado** — apenas console.warn/error
- **Sem observabilidade** — sem Sentry, sem analytics, sem health checks
- **28 console statements** em produção
- **Dead code** em 3 ficheiros
- **README.md** existe com instruções de setup (positivo)

### J. Performance — 5/10

- **Bundle 1,517 KB** (453 KB gzipped) — excede limite recomendado 3x
- **Zero code-splitting** — todas as 17 páginas e Recharts no bundle principal
- **11 queries Supabase** no Dashboard load (5 Classic + 6 Summary)
- **DealForm carrega 7 datasets** no mount
- **Sem React.memo()** em nenhum componente
- **Sem virtual scrolling** em listas longas

### K. Adequação da Stack — 7/10

**A stack actual SERVE com limitações:**

| Requisito | Stack suporta? | Limitação |
|-----------|---------------|-----------|
| PWA | Sim (Vite PWA plugin) | Precisa configurar |
| Performance | Sim (code-splitting nativo) | Precisa implementar |
| i18n | Sim (sistema custom funciona) | Escala limitada |
| Escala | Sim (Supabase escala) | RLS precisa reforço |
| Multi-tenant | Parcial | app_settings existe mas não é multi-tenant real |

**Recomendação: MANTER e REFORÇAR, não reescrever.**
- React + Vite + Tailwind + Supabase é uma stack moderna e adequada
- O custo de migração para Next.js/Remix não justifica o ganho
- A dívida técnica é corrigível incrementalmente
- PWA é adicionável via `vite-plugin-pwa` sem mudança de stack

---

## FASE 3 — PLANO DE ACÇÃO

### Onda 1: Bloqueadores de Produção (1-2 semanas)

| # | Acção | Esforço |
|---|-------|---------|
| 1 | **Fix RLS distribuidores** — adicionar company_id filter + column-level security para cost_price | 4h |
| 2 | **Implementar PWA** — manifest.json, service worker, ícones, theme-color | 8h |
| 3 | **Code-splitting** — React.lazy() para todas as rotas | 4h |
| 4 | **Error boundary para dados** — toast/banner quando Supabase falha | 4h |
| 5 | **Remover dead code** — Settings.jsx, Users.jsx, isMaint, console.* | 2h |

### Onda 2: Estabilização (2-4 semanas)

| # | Acção | Esforço |
|---|-------|---------|
| 6 | **Validação de transições** — state machine para deals e contratos | 8h |
| 7 | **Input validation** — schema validation nas forms (zod ou similar) | 8h |
| 8 | **Testes básicos** — unit tests para hooks + integration para fluxos críticos | 16h |
| 9 | **Consolidar migrações** — single migration file com todas as tabelas | 4h |
| 10 | **Refactoring ficheiros grandes** — split DealForm, Permissions, SLAs | 12h |

### Onda 3: Polimento (4-6 semanas)

| # | Acção | Esforço |
|---|-------|---------|
| 11 | **i18n completo** — traduzir 762 strings, adicionar 64 keys PT | 12h |
| 12 | **Performance** — React.memo, virtual scroll, query caching | 8h |
| 13 | **Offline support** — service worker cache strategy | 8h |
| 14 | **Logging & observabilidade** — Sentry, structured logging | 4h |
| 15 | **Testes e2e** — Cypress/Playwright para fluxos principais | 16h |

### Quick Wins (baixo esforço, alto impacto)

1. Remover dead code (2h)
2. Code-splitting com React.lazy (4h)
3. manifest.json + ícones (2h)
4. Error toast global para falhas de Supabase (4h)
5. Remover console.* de produção (1h)

### Estimativa de Esforço Total

| Onda | Horas | Semanas (1 dev) |
|------|-------|-----------------|
| Onda 1 | ~22h | 1 semana |
| Onda 2 | ~48h | 2-3 semanas |
| Onda 3 | ~48h | 2-3 semanas |
| **Total** | **~118h** | **6-7 semanas** |

### Decisões que Precisam do Owner

1. **PWA offline** — que dados devem estar disponíveis offline? (deals? contratos?)
2. **Multi-tenant** — será usado por múltiplas empresas em instâncias separadas ou partilhada?
3. **Testes** — investir em testes e2e ou aceitar risco de regressão?
4. **i18n** — adicionar mais línguas (FR, DE) ou apenas PT/EN/ES?
5. **Column-level security** — implementar via Postgres views ou Edge Functions?
