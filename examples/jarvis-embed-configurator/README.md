# Configurateur embed Jarvis (AnythingLLM)

Page HTML autonome pour personnaliser le widget chat AnythingLLM et prévisualiser le résultat.

## Utilisation

Ouvrir `index.html` via un serveur HTTP local (recommandé) :

```bash
npx serve examples/jarvis-embed-configurator -p 5500
```

Puis : http://127.0.0.1:5500/

## Fonctions

- Connexion (embed ID, API URL, script)
- Apparence (icône, couleurs, taille, position, textes)
- Sponsor / « Powered by »
- Comportement (ouverture auto, thoughts, support)
- Overrides LLM optionnels
- Aperçu live + copie du snippet `<script>`

Référence des options : [anythingllm-embed README](https://github.com/Mintplex-Labs/anythingllm-embed/blob/main/README.md)
