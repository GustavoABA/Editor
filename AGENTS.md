# REGRA DE BRANCH OBRIGATÓRIA — LEIA ANTES DE QUALQUER ALTERAÇÃO

**Desenvolvimento, validação, correção, commits e testes do Editor: SOMENTE na branch `teste/implementacao`.** A `main` é a referência estável e do planejamento; a F10 de edição híbrida LAN está em implementação experimental na branch de teste, no [PR #2](https://github.com/GustavoABA/Editor/pull/2). A antiga branch `feature/lan-hybrid-sync` e o PR #1 estão obsoletos. Não modificar código da `main`, não fazer merge, não trabalhar na branch antiga sem autorização explícita.

**Ao iniciar um agente/Codex:** execute `git fetch origin`, `git switch teste/implementacao`, `git pull --ff-only origin teste/implementacao`, e confira `git branch --show-current`. Se não puder trocar a branch, informe o bloqueio em vez de editar `main`. **Leia o `features.md` na branch de teste**, além de `docs/cross-device-project-sync.md` e `docs/lan-hybrid-implementation.md`. Antes de implementar, audite o código já desenvolvido e rode testes; depois corrija itens faltantes, atualize os checkboxes/status **na branch de teste**, e envie commits apenas para ela. Só marque concluído o que foi testado e validado. A implantação final na `main` requer aprovação do proprietário.

---

# Agents.md

## Architecture

An ongoing migration is moving all business logic into `rust/`. Each app under `apps/` is a UI shell — it owns rendering, interaction, and platform-specific concerns, but never owns logic. The UI framework for any given app is a replaceable detail.

### `rust/`

The single source of truth for all non-UI code. Everything platform-agnostic belongs here: no components, no hooks, no framework imports.

### `apps/`

Each app is a frontend that calls into Rust. Logic is never duplicated between apps — only UI is, because each platform may use an entirely different framework and language to build it.

- `web/` — Next.js
- `desktop/` — GPUI

## Web

### React

- Read components before using them. They may already apply classes, which affects what you need to pass and how to override them.

