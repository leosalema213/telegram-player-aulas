# Pendências

- [ ] Validar login com código, login com duas etapas, reconexão e desconexão em uma conta de teste.
- [ ] Importar um canal real e conferir títulos, duração e sequência dos capítulos. Testar a reprodução e o salto para o meio de um vídeo grande.
- [ ] Conferir os termos da API antes de distribuir, incluindo API ID próprio, apresentação da integração e suporte a mensagens patrocinadas em canais. [Termos da API do Telegram](https://core.telegram.org/api/terms)
- [x] Gerar e validar o instalador de prévia do Windows em um perfil separado (0.1.0-preview.7: instalação inicial, reinstalação e abertura em modo demonstração).
- [ ] Validar o fluxo de atualização pelo app e a preservação do perfil após reinstalação. Conferir a primeira Release estável e seus metadados no canal de atualização após autorização.
- [ ] Inspecionar abertura do link e seletores de país e canais nas paletas, inclusive navegação por teclado; validar os formatos de telefone na interface. O seletor inicial cobre Brasil, Portugal, Estados Unidos e Reino Unido.
- [ ] Validar o fluxo completo de descoberta, download e reinício para atualização com uma fonte de teste; a atualização da prévia 0.1.0-preview.7 para a estável 0.1.0 preservou arquivos de perfil isolados, e a falha com nova tentativa foi simulada no atualizador.
- [ ] Implementar e validar suporte a mensagens patrocinadas em canais e conferir os demais requisitos dos termos da API do Telegram antes de considerar a integração adequada para distribuição ampla.
- [ ] Validar em um canal real a importação e atualização de documentos, download, arquivo indisponível e nova tentativa; confirmar que a atualização mantém o progresso existente. Os documentos são exibidos por curso e não são associados automaticamente a uma aula.
- [ ] Antes da primeira publicação, confirmar acesso de escrita ao origin (a leitura retornou sem referências), preparar e validar os arquivos de atualização e publicar somente após aval explícito.
