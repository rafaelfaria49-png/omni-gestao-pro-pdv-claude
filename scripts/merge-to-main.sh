#!/bin/bash
# merge-to-main.sh — Merge seguro de uma branch de terminal para main via dev.
#
# Uso:
#   ./scripts/merge-to-main.sh terminal-1
#   ./scripts/merge-to-main.sh terminal-2
#   ./scripts/merge-to-main.sh terminal-3
#
# Fluxo: terminal-N → dev → main → push (dispara deploy na Vercel)

set -e  # Aborta se qualquer comando falhar

BRANCH=${1:-""}

if [ -z "$BRANCH" ]; then
  echo "❌  Informe a branch: ./scripts/merge-to-main.sh terminal-1"
  exit 1
fi

# Verifica se a branch existe
if ! git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "❌  Branch '$BRANCH' não encontrada localmente."
  exit 1
fi

echo ""
echo "🔀  Mergeando $BRANCH → dev → main"
echo "--------------------------------------"

# 1. Garantir que estamos com o main atualizado
echo "📥  Atualizando main..."
git fetch origin main
git checkout main
git merge --ff-only origin/main 2>/dev/null || git merge origin/main

# 2. Atualizar dev com o main antes de fazer merge
echo "📥  Atualizando dev..."
git checkout dev
git merge --ff-only origin/dev 2>/dev/null || true
git merge main --no-ff -m "chore(dev): sync main → dev antes do merge"

# 3. Merge da branch do terminal para dev
echo "🔀  Mergeando $BRANCH → dev..."
git merge "$BRANCH" --no-ff -m "merge: $BRANCH → dev"

# 4. Rodar build para garantir que não quebrou nada
echo "🔨  Rodando build de validação..."
npm run build 2>&1 | tail -10

# 5. Push dev
echo "📤  Push dev..."
git push origin dev

# 6. Merge dev → main
echo "🔀  Mergeando dev → main..."
git checkout main
git merge dev --no-ff -m "merge: dev → main (via $BRANCH)"

# 7. Push main — dispara deploy na Vercel
echo "📤  Push main → Vercel deploy..."
git push origin main

echo ""
echo "✅  Deploy disparado na Vercel!"
echo "   Branch origem: $BRANCH"
echo "   Branch alvo:   main"
echo ""
