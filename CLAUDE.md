
## Code graph (surgical-context-mcp)

- En début de tâche : lire `GRAPH_REPORT.md` ou appeler `get_architecture_map`.
- Avant de modifier une fonction, méthode ou classe : `get_edit_context(symbol="<nom>", budget_tokens=4000)`, puis éditer sans relire le fichier entier.
- Avant de renommer, supprimer ou changer une signature : `check_rename_or_delete(symbol="<nom>")`.
- Questions d'impact ou de flux : `get_symbol_impact`, `find_flow`, `search_symbols`.
- Tests et revue : `tests_for`, `get_diff_impact`.
- Ne jamais lire en entier un fichier source de plus de 300 lignes : utiliser `offset`/`limit`.
- Attention : Babylon.js repose beaucoup sur des callbacks et des observables. Si un résultat est marqué incertain, vérifier dans le code.
