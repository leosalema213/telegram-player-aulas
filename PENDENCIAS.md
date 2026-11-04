# Pendências

- [ ] Validar login com código, login com duas etapas, reconexão e desconexão em uma conta de teste.
- [ ] Importar um canal real e conferir títulos, duração e sequência dos capítulos. Testar a reprodução e o salto para o meio de um vídeo grande.
- [ ] Conferir os termos da API antes de distribuir, incluindo API ID próprio, apresentação da integração e suporte a mensagens patrocinadas em canais. [Termos da API do Telegram](https://core.telegram.org/api/terms)
- [x] Gerar e validar o instalador de prévia do Windows em um perfil separado (0.1.0-preview.7: instalação inicial, reinstalação e abertura em modo demonstração).
- [ ] Validar o fluxo de download e reinício pelo app em uma próxima versão. A primeira Release estável e seus metadados foram conferidos; a prévia detectou a versão 0.1.0 no canal real.
- [ ] Inspecionar abertura do link e seletores de país e canais nas paletas, inclusive navegação por teclado; validar os formatos de telefone na interface. O seletor inicial cobre Brasil, Portugal, Estados Unidos e Reino Unido.
- [ ] Validar o fluxo completo de descoberta, download e reinício para atualização com uma fonte de teste; a atualização da prévia 0.1.0-preview.7 para a estável 0.1.0 preservou arquivos de perfil isolados, e a falha com nova tentativa foi simulada no atualizador.
- [ ] Implementar e validar suporte a mensagens patrocinadas em canais e conferir os demais requisitos dos termos da API do Telegram antes de considerar a integração adequada para distribuição ampla.
- [ ] Validar em um canal real a importação e atualização de documentos, download, arquivo indisponível e nova tentativa; confirmar que a atualização mantém o progresso existente. Os documentos são exibidos por curso e não são associados automaticamente a uma aula.
- [ ] Validar em aulas reais a conclusão automática no fim, controles do player e velocidade entre aulas/cursos e após reiniciar. Medir consumo em uso contínuo com vídeo real.
- [ ] Validar em canal real a retomada pausada da última aula ao abrir, as velocidades personalizadas e o modo teatro da prévia 0.1.1-preview.2.
- [ ] Confirmar preservação do perfil efetivamente usado pelo aplicativo instalado durante uma atualização: os testes anteriores de instalador conferiram arquivos artificiais, mas a variável APPDATA sozinha não garantiu o isolamento do perfil Electron.
- [x] Confirmar acesso de escrita ao origin e publicar a primeira versão estável com instalador e SHA-256 após autorização do usuário.
