# Regras do Player de Aulas

- Faça mudanças incrementais e localizadas. Preserve os dados dos perfis existentes.
- Use o Organon (`../estudo-desktop`) como referência visual. Mantenha a barra lateral compacta, superfícies escuras neutras, textos em português e cores pastel para progresso, conclusão e erro.
- Use ícones da biblioteca Lucide, a mesma do Organon, em vez de caracteres Unicode ou desenhos improvisados. Personalize somente quando não houver ícone adequado.
- Antes de mudar um fluxo, considere importação, consulta, atualização, remoção, falhas parciais e novas tentativas. Registre pendências em `PENDENCIAS.md`.
- Mantenha catálogo e progresso em arquivos locais. Use o armazenamento seguro do sistema para a sessão. Não adicione banco, sincronização, telemetria ou servidor próprio.
- Faça validações locais focadas. Para testar uma conta real, forneça um comando copiável para o usuário rodar no PowerShell.
- Ao concluir cada lote, gere e valide um instalador de prévia do Windows com versão própria e entregue-o para o usuário testar. Depois da validação e do aval explícito do usuário para aquele lote, promova a versão, faça commit e push e publique uma nova GitHub Release estável em `leosalema213/telegram-player-aulas`. Preserve o histórico e mantenha as prévias fora do canal estável de atualização.
- Para economizar chamadas, use `node scripts/fluxo-release.cjs preview` para preparar, testar e gerar a prévia. Após o teste e aval explícito do usuário, revise e registre em commit apenas os arquivos aprovados, então use `node scripts/fluxo-release.cjs publicar --aprovado` para gerar e publicar a versão estável. Se uma etapa falhar, inspecione o estado antes de retomar; não inclua alterações não relacionadas nem force o Git.
- Após gerar e conferir um instalador, mantenha localmente em `release` apenas a versão gerada e a versão anterior com instalador; remova as demais pastas de versões pelo script de limpeza do projeto. Não remova perfis, arquivos que não sejam pastas de versão ou releases no GitHub. Preserve uma versão anterior se a geração atual falhar.
