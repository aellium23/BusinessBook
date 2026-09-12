# Design system — BusinessBook

**Estado:** derivado de `tailwind.config.js` e `src/index.css`, em 2026-09-11.

Não há Figma. Este documento **é** a especificação: os tokens abaixo são os que
o código impõe, e um componente novo que invente a sua própria escala está
errado por definição, não por opinião.

O produto é **mobile-first**. A ordem de leitura é telemóvel → tablet →
secretária, e não o contrário.

---

## 1. Cores

| Token | Valor | Uso |
|---|---|---|
| `navy` | `#0D2137` | Cor primária. Barra de topo, botões primários, estado activo |
| `navy-light` | `#1a3a5c` | Hover do primário |
| `vgt` | `#1D9E75` | Fujifilm Portugal. Verde |
| `vgt-light` / `vgt-dark` | `#E1F5EE` / `#0F6E56` | Fundo de badge / texto sobre claro |
| `ect` | `#D85A30` | Fujifilm Espanha. Laranja |
| `ect-light` / `ect-dark` | `#FAECE7` / `#993C1D` | Fundo de badge / texto sobre claro |

**Semântica de estado**, pelas cores base do Tailwind: verde sucesso e faturado ·
âmbar atenção e backlog · vermelho erro e perdido · roxo pendente · azul
informação e pipeline · cinzento neutro e lead.

**Uma regra que a auditoria mostrou importar:** cor sozinha não comunica estado.
Uma etiqueta de desconto leva sempre um símbolo (`⏳ ↔ ✓ ✗`) além da cor — quem
não distingue verde de âmbar continua a ler a etiqueta.

---

## 2. Espaço e forma

| Token | Valor | Uso |
|---|---|---|
| `rounded-card` | 16px | Cartões, linhas de lista, dropdowns |
| `rounded-modal` | 24px | Modais, folhas inferiores |
| `rounded-control` | 12px | Inputs, botões, chips |
| `rounded-full` | — | Badges |

| Sombra | Valor | Uso |
|---|---|---|
| `shadow-sm` | `0 1px 2px rgba(13,33,55,.06)` | Cartão em repouso |
| `shadow-md` | `0 4px 10px rgba(13,33,55,.08)` | Hover, elevação interactiva |
| `shadow-lg` | `0 10px 24px rgba(13,33,55,.10)` | Popovers, dropdowns |
| `shadow-modal` | `0 -8px 40px rgba(13,33,55,.18)` | Folhas inferiores |

---

## 3. Tipografia

| Token | Tamanho | Uso |
|---|---|---|
| `text-micro` | 10px | Badges, contagens |
| `text-tiny` | 11px | Textos de ajuda |
| `text-xs` | 12px | Etiquetas, metadados |
| `text-sm` | 14px | Corpo |
| `text-base` | 16px | Ênfase |
| `text-xl` / `text-2xl` | 20 / 24px | Valores monetários, títulos |

**`BB Hand`** (`public/fonts/caveat.woff2`) é a letra manuscrita do funil Instax.
Acompanha a app em vez de depender do que estiver instalado — uma réplica de uma
fotografia não pode ser uma página diferente em cada portátil.

**Algarismos tabulares** em todo o corpo (`font-variant-numeric: tabular-nums`),
para que colunas de números alinhem.

---

## 4. Componentes

Classes em `@layer components`, `src/index.css`:

`.card` · `.card-link` · `.btn` · `.btn-primary` · `.btn-secondary` ·
`.btn-danger` · `.btn-sm` · `.input` · `.input-error` · `.select` · `.label` ·
`.badge` e variantes semânticas (`-primary -success -warning -info -neutral
-danger`), de unidade (`-vgt -ect -int -ext`) e de fase (`-lead -pipeline -offer
-backlog -invoiced -lost`).

51 componentes React em `src/components/`.

---

## 5. Estados

Todo o componente que carrega dados tem de responder a quatro perguntas, e
**três delas foram encontradas em falta na auditoria**:

| Estado | Regra |
|---|---|
| **Loading** | Enquanto não se sabe, não se afirma. O quick deal desenhava a proposta vazia e depois saltava para a guardada |
| **Empty** | "Ainda não há X" — e nunca confundível com um erro |
| **Error** | Diz o que aconteceu. O Budget mostrava uma página de zeros quando a carga falhava |
| **Success** | O conteúdo |

**Vazio e erro nunca podem parecer a mesma coisa.** Um catálogo vazio é o que a
mensagem "não tens produtos autorizados" deriva — e por isso todos os parceiros
eram informados, por instantes, de que não podiam vender nada.

**Disabled** leva sempre uma razão a acompanhar. Um botão cinzento sem
explicação lê-se como avaria.

---

## 6. Responsive

| Ponto de corte | Largura | Comportamento |
|---|---|---|
| base | < 640px | Telemóvel. Coluna única, navegação inferior com 4 itens + "More" |
| `sm:` | ≥ 640px | Duas colunas onde faz sentido |
| `md:` | ≥ 768px | Tablet. O funil Instax passa da lista para a cena |
| `lg:` | ≥ 1024px | Barra lateral em vez de navegação inferior |

**Alvos de toque:** `min-h-tap` / `min-w-tap` = 44px, conforme as HIG da Apple.
Usar em botões de ícone onde o visual é menor que a área de toque.

**Áreas seguras:** `env(safe-area-inset-*)` na barra de topo e na navegação
inferior, para o entalhe e a barra de gestos.

**Sem scroll horizontal, a nenhuma largura.** Verificado a 390, 768 e 1440 px na
auditoria de 11-09: nenhum elemento excede o contentor. Tabelas largas vão
dentro do seu próprio `overflow-x-auto`.

---

## 7. Larguras, alvos e transbordo — as regras de 12-09

**Duas larguras de página, não sete.** `max-w-6xl` (1152px) nas páginas de
leitura densa — tabelas, orçamento, histórico, listas com filtros — e
`max-w-4xl` (896px) em tudo o resto. Padding `p-4 sm:p-6` em todas. Uma página
sem contentor herda a largura total do `main`, que é a maneira silenciosa de
criar uma terceira largura: quatro páginas estavam assim.

**Tudo o que se toca tem 44px.** `.btn`, `.input` e `.select` já os têm. Um botão
escrito à mão com Tailwind cru não — `px-2.5 py-1` dá 26px — e por isso leva
`min-h-tap`. A conta mede-se, não se estima: quinze botões estavam abaixo.

**O `main` tem `overflow-x-hidden`, e isso CORTA.** Não deixa rolar: esconde.
Portanto todo o conteúdo genuinamente mais largo do que o ecrã — tabelas,
kanban, filas de separadores — leva o seu próprio `overflow-x-auto`. Sem ele não
rebenta o layout; desaparece pela direita, e nada avisa ninguém.

**Grelhas.** Uma ou duas colunas empilham sozinhas e não precisam de nada. Três
colunas de números curtos cabem em 360px. **De quatro para cima, sempre
`grid-cols-2 sm:grid-cols-N`** — seis colunas num telemóvel dão 60px cada, onde o
número cabe e a etiqueta por cima dele não.

**Números em coluna levam `tabular-nums`.** Um número solto numa frase não.

---

## 8. O que falta documentar

| Área | Falta |
|---|---|
| Acessibilidade | Contrastes nunca medidos. Navegação por teclado nunca testada |
| Movimento | Durações e curvas usadas ad hoc |
| Ícones | `lucide-react`, sem regra de tamanho por contexto |
| Densidade | Sem espaçamento vertical definido entre secções |

**Nota sobre `lucide-react`:** os nomes dos ícones variam entre versões. Dois
builds falharam hoje por importar nomes que esta versão não exporta (`Images`,
`Handshake`). Confirmar antes de importar.
